using System.Globalization;
using System.Net.Sockets;
using System.Text.RegularExpressions;

namespace MiracastCpu;

internal sealed partial class WfdSession : IAsyncDisposable
{
    private const string WfdUri = "rtsp://localhost/wfd1.0";
    private const int LocalRtpPort = 50000;

    private readonly TcpClient _client;
    private readonly RtspConnection _rtsp;
    private readonly string _localAddress;
    private readonly string _remoteAddress;
    private readonly bool _stream;
    private int _cseq = 1;
    private string _sessionId = Convert.ToHexString(
        Guid.NewGuid().ToByteArray())[..12];
    private FfmpegStreamer? _ffmpeg;

    public WfdSession(
        TcpClient client,
        string localAddress,
        string remoteAddress,
        bool stream)
    {
        _client = client;
        _localAddress = localAddress;
        _remoteAddress = remoteAddress;
        _stream = stream;
        _rtsp = new RtspConnection(
            client.GetStream(),
            Path.Combine("logs", $"rtsp-{DateTime.Now:yyyyMMdd-HHmmss}.log"));
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        await ExchangeM1M2Async(cancellationToken);
        var capabilities = await QueryCapabilitiesAsync(cancellationToken);
        var sinkRtpPort = ParseSinkRtpPort(capabilities);
        var selectedVideo = SelectVideoFormat(capabilities);

        Console.WriteLine($"RTP da TV: {sinkRtpPort}");
        Console.WriteLine($"Vídeo selecionado: {selectedVideo}");

        await SetParametersAsync(
            capabilities,
            selectedVideo,
            cancellationToken);
        await TriggerSetupAsync(cancellationToken);
        await AcceptSetupAndPlayAsync(sinkRtpPort, cancellationToken);

        if (_stream)
        {
            Console.WriteLine("PLAY recebido; iniciando captura por CPU.");
            _ffmpeg = FfmpegStreamer.Start(
                _remoteAddress,
                sinkRtpPort,
                LocalRtpPort,
                Path.Combine(
                    "logs",
                    $"ffmpeg-{DateTime.Now:yyyyMMdd-HHmmss}.log"));
        }
        else
        {
            Console.WriteLine("PLAY recebido; probe concluído sem vídeo.");
        }

        using var sessionCts = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken);
        var keepAlive = KeepAliveLoopAsync(sessionCts.Token);
        try
        {
            await ServiceLoopAsync(sessionCts.Token);
        }
        finally
        {
            sessionCts.Cancel();
            await keepAlive;
        }
    }

    private async Task KeepAliveLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                await Task.Delay(
                    TimeSpan.FromSeconds(25),
                    cancellationToken);
                var keepAlive = RtspMessage.Request(
                    "GET_PARAMETER",
                    WfdUri,
                    _cseq++);
                keepAlive.Headers["Session"] = _sessionId;
                await _rtsp.SendAsync(keepAlive, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (IOException)
        {
        }
    }

    private async Task ExchangeM1M2Async(
        CancellationToken cancellationToken)
    {
        var m1 = RtspMessage.Request("OPTIONS", "*", _cseq++);
        m1.Headers["Require"] = "org.wfa.wfd1.0";
        await _rtsp.SendAsync(m1, cancellationToken);
        EnsureOk(await _rtsp.ReadAsync(cancellationToken), "M1");

        var m2 = await _rtsp.ReadAsync(cancellationToken);
        if (!m2.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException(
                $"M2 esperado OPTIONS, recebido {m2.StartLine}");
        }
        var response = RtspMessage.Response(m2.CSeq);
        response.Headers["Public"] =
            "org.wfa.wfd1.0, GET_PARAMETER, SET_PARAMETER, " +
            "SETUP, PLAY, PAUSE, TEARDOWN";
        await _rtsp.SendAsync(response, cancellationToken);
    }

    private async Task<string> QueryCapabilitiesAsync(
        CancellationToken cancellationToken)
    {
        const string body =
            "wfd_video_formats\r\n" +
            "wfd_audio_codecs\r\n" +
            "wfd_client_rtp_ports\r\n" +
            "wfd_content_protection\r\n" +
            "wfd_display_edid\r\n" +
            "wfd_connector_type\r\n" +
            "wfd_uibc_capability\r\n";
        await _rtsp.SendAsync(
            RtspMessage.Request("GET_PARAMETER", WfdUri, _cseq++, body),
            cancellationToken);
        var response = await _rtsp.ReadAsync(cancellationToken);
        EnsureOk(response, "M3");
        File.WriteAllText(
            Path.Combine("logs", "last-capabilities.txt"),
            response.Body);
        return response.Body;
    }

    private async Task SetParametersAsync(
        string capabilities,
        string selectedVideo,
        CancellationToken cancellationToken)
    {
        var clientPorts = GetParameter(
            capabilities,
            "wfd_client_rtp_ports");
        var body =
            $"wfd_video_formats: {selectedVideo}\r\n" +
            $"wfd_presentation_URL: rtsp://{_localAddress}/wfd1.0/streamid=0 none\r\n" +
            $"wfd_client_rtp_ports: {clientPorts}\r\n";
        await _rtsp.SendAsync(
            RtspMessage.Request("SET_PARAMETER", WfdUri, _cseq++, body),
            cancellationToken);
        EnsureOk(await _rtsp.ReadAsync(cancellationToken), "M4");
    }

    private async Task TriggerSetupAsync(
        CancellationToken cancellationToken)
    {
        await _rtsp.SendAsync(
            RtspMessage.Request(
                "SET_PARAMETER",
                WfdUri,
                _cseq++,
                "wfd_trigger_method: SETUP\r\n"),
            cancellationToken);
        EnsureOk(await _rtsp.ReadAsync(cancellationToken), "M5");
    }

    private async Task AcceptSetupAndPlayAsync(
        int sinkRtpPort,
        CancellationToken cancellationToken)
    {
        var setup = await _rtsp.ReadAsync(cancellationToken);
        if (!setup.Method.Equals("SETUP", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException(
                $"M6 esperado SETUP, recebido {setup.StartLine}");
        }

        var setupResponse = RtspMessage.Response(setup.CSeq);
        setupResponse.Headers["Session"] = $"{_sessionId};timeout=60";
        setupResponse.Headers["Transport"] =
            $"RTP/AVP/UDP;unicast;client_port={sinkRtpPort};" +
            $"server_port={LocalRtpPort}-{LocalRtpPort + 1}";
        await _rtsp.SendAsync(setupResponse, cancellationToken);

        var play = await _rtsp.ReadAsync(cancellationToken);
        if (!play.Method.Equals("PLAY", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException(
                $"M7 esperado PLAY, recebido {play.StartLine}");
        }
        var playResponse = RtspMessage.Response(play.CSeq);
        playResponse.Headers["Session"] = _sessionId;
        await _rtsp.SendAsync(playResponse, cancellationToken);
    }

    private async Task ServiceLoopAsync(
        CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var message = await _rtsp.ReadAsync(cancellationToken);
                if (message.IsResponse)
                {
                    continue;
                }

                var response = RtspMessage.Response(message.CSeq);
                if (message.Headers.TryGetValue("Session", out _))
                {
                    response.Headers["Session"] = _sessionId;
                }
                await _rtsp.SendAsync(response, cancellationToken);

                if (message.Method.Equals(
                        "TEARDOWN",
                        StringComparison.OrdinalIgnoreCase))
                {
                    break;
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (IOException exception)
        {
            Console.WriteLine($"Sessão encerrada: {exception.Message}");
        }
    }

    private static int ParseSinkRtpPort(string capabilities)
    {
        var value = GetParameter(capabilities, "wfd_client_rtp_ports");
        var match = RtpPortRegex().Match(value);
        return match.Success
            ? int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture)
            : throw new InvalidDataException(
                $"Porta RTP inválida: {value}");
    }

    private static string SelectVideoFormat(string capabilities)
    {
        var value = GetParameter(capabilities, "wfd_video_formats");
        var firstCodec = value.Split(',', 2)[0]
            .Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (firstCodec.Length < 4)
        {
            throw new InvalidDataException(
                $"wfd_video_formats inválido: {value}");
        }

        var profile = firstCodec[2];
        var level = firstCodec[3];
        return
            $"00 00 {profile} {level} " +
            "00000020 00000000 00000000 " +
            "00 0000 0000 00 none none";
    }

    private static string GetParameter(string body, string name)
    {
        var prefix = $"{name}:";
        var line = body.Split(
                ['\r', '\n'],
                StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault(
                item => item.StartsWith(
                    prefix,
                    StringComparison.OrdinalIgnoreCase));
        return line is null
            ? throw new InvalidDataException(
                $"A TV não informou {name}.")
            : line[prefix.Length..].Trim();
    }

    private static void EnsureOk(RtspMessage response, string stage)
    {
        if (!response.StartLine.Contains(" 200 ", StringComparison.Ordinal))
        {
            var detail = string.IsNullOrWhiteSpace(response.Body)
                ? ""
                : $"\nCorpo da resposta:\n{response.Body.Trim()}";
            throw new InvalidDataException(
                $"{stage} rejeitado: {response.StartLine}{detail}");
        }
    }

    public async ValueTask DisposeAsync()
    {
        _ffmpeg?.Dispose();
        await _rtsp.DisposeAsync();
        _client.Dispose();
    }

    [GeneratedRegex(
        @"RTP/AVP/UDP;unicast\s+(\d+)",
        RegexOptions.IgnoreCase)]
    private static partial Regex RtpPortRegex();
}
