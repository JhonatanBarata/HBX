using System.Globalization;
using System.Net.Sockets;
using System.Text;

namespace MiracastCpu;

internal sealed class RtspMessage
{
    public required string StartLine { get; init; }
    public Dictionary<string, string> Headers { get; } =
        new(StringComparer.OrdinalIgnoreCase);
    public string Body { get; init; } = "";

    public bool IsResponse => StartLine.StartsWith("RTSP/", StringComparison.Ordinal);
    public string Method => IsResponse
        ? ""
        : StartLine.Split(' ', 2)[0];
    public int CSeq => Headers.TryGetValue("CSeq", out var value)
        && int.TryParse(value, out var result)
            ? result
            : 0;

    public static RtspMessage Request(
        string method,
        string uri,
        int cseq,
        string body = "")
    {
        var message = new RtspMessage
        {
            StartLine = $"{method} {uri} RTSP/1.0",
            Body = body
        };
        message.Headers["CSeq"] = cseq.ToString(CultureInfo.InvariantCulture);
        message.Headers["User-Agent"] = "MiracastCpuLab/0.1";
        if (body.Length > 0)
        {
            message.Headers["Content-Type"] = "text/parameters";
        }
        return message;
    }

    public static RtspMessage Response(
        int cseq,
        int status = 200,
        string reason = "OK")
    {
        var message = new RtspMessage
        {
            StartLine = $"RTSP/1.0 {status} {reason}"
        };
        message.Headers["CSeq"] = cseq.ToString(CultureInfo.InvariantCulture);
        return message;
    }

    public byte[] Serialize()
    {
        var bodyBytes = Encoding.ASCII.GetBytes(Body);
        if (bodyBytes.Length > 0)
        {
            Headers["Content-Length"] =
                bodyBytes.Length.ToString(CultureInfo.InvariantCulture);
        }

        var builder = new StringBuilder();
        builder.Append(StartLine).Append("\r\n");
        foreach (var header in Headers)
        {
            builder.Append(header.Key).Append(": ")
                .Append(header.Value).Append("\r\n");
        }
        builder.Append("\r\n");

        var headerBytes = Encoding.ASCII.GetBytes(builder.ToString());
        return [.. headerBytes, .. bodyBytes];
    }

    public override string ToString()
    {
        var data = Serialize();
        return Encoding.ASCII.GetString(data);
    }
}

internal sealed class RtspConnection : IAsyncDisposable
{
    private readonly NetworkStream _stream;
    private readonly StreamWriter _log;
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly SemaphoreSlim _logLock = new(1, 1);

    public RtspConnection(NetworkStream stream, string logPath)
    {
        _stream = stream;
        _log = new StreamWriter(
            File.Open(logPath, FileMode.Create, FileAccess.Write, FileShare.Read))
        {
            AutoFlush = true
        };
    }

    public async Task SendAsync(
        RtspMessage message,
        CancellationToken cancellationToken)
    {
        var bytes = message.Serialize();
        await _writeLock.WaitAsync(cancellationToken);
        try
        {
            await _stream.WriteAsync(bytes, cancellationToken);
            await _stream.FlushAsync(cancellationToken);
        }
        finally
        {
            _writeLock.Release();
        }
        await LogAsync(">>>", Encoding.ASCII.GetString(bytes));
    }

    public async Task<RtspMessage> ReadAsync(
        CancellationToken cancellationToken)
    {
        var headerBytes = new List<byte>();
        var tail = 0;
        while (tail != 0x0D0A0D0A)
        {
            var buffer = new byte[1];
            var read = await _stream.ReadAsync(buffer, cancellationToken);
            if (read == 0)
            {
                throw new IOException("A TV fechou a conexão RTSP.");
            }
            headerBytes.Add(buffer[0]);
            tail = ((tail << 8) | buffer[0]) & unchecked((int)0xFFFFFFFF);
            if (headerBytes.Count > 64 * 1024)
            {
                throw new InvalidDataException("Cabeçalho RTSP excessivo.");
            }
        }

        var headerText = Encoding.ASCII.GetString(headerBytes.ToArray());
        var lines = headerText.Split(
            "\r\n",
            StringSplitOptions.None);
        var message = new RtspMessage { StartLine = lines[0] };

        foreach (var line in lines.Skip(1))
        {
            var separator = line.IndexOf(':');
            if (separator <= 0)
            {
                continue;
            }
            message.Headers[line[..separator].Trim()] =
                line[(separator + 1)..].Trim();
        }

        var contentLength = message.Headers.TryGetValue(
                "Content-Length",
                out var lengthValue)
            && int.TryParse(lengthValue, out var parsed)
                ? parsed
                : 0;
        if (contentLength > 0)
        {
            var body = new byte[contentLength];
            await _stream.ReadExactlyAsync(body, cancellationToken);
            message = new RtspMessage
            {
                StartLine = message.StartLine,
                Body = Encoding.ASCII.GetString(body)
            }.WithHeaders(message.Headers);
        }

        await LogAsync("<<<", message.ToString());
        return message;
    }

    private async Task LogAsync(string direction, string text)
    {
        var block =
            $"[{DateTimeOffset.Now:O}] {direction}\n{text.TrimEnd()}\n\n";
        Console.WriteLine($"{direction} {text.Split("\r\n", 2)[0]}");
        await _logLock.WaitAsync();
        try
        {
            await _log.WriteAsync(block);
        }
        finally
        {
            _logLock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _log.DisposeAsync();
        _writeLock.Dispose();
        _logLock.Dispose();
    }
}

internal static class RtspMessageExtensions
{
    public static RtspMessage WithHeaders(
        this RtspMessage message,
        IReadOnlyDictionary<string, string> headers)
    {
        foreach (var header in headers)
        {
            message.Headers[header.Key] = header.Value;
        }
        return message;
    }
}
