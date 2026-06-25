using System.Diagnostics;
using System.Net;
using System.Net.Sockets;

namespace MiracastCpu;

internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        var command = args.FirstOrDefault()?.ToLowerInvariant() ?? "list";

        try
        {
            return command switch
            {
                "list" => await WiFiDirectConnector.ListAsync(),
                "connect" => await HoldConnectionAsync(
                    args.Skip(1).FirstOrDefault() ?? "Samsung"),
                "probe" => await RunWfdAsync(
                    args.Skip(1).FirstOrDefault() ?? "Samsung", false, 30),
                "cast" => await RunWfdAsync(
                    args.Skip(1).FirstOrDefault() ?? "Samsung",
                    true,
                    ParseSeconds(args.Skip(2).FirstOrDefault())),
                "hijack" => await HijackNativeStackAsync(
                    ParseSeconds(args.Skip(1).FirstOrDefault())),
                "mft" => MftDiagnostics.Run(),
                _ => Usage()
            };
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(exception);
            return 1;
        }
    }

    private static async Task<int> HoldConnectionAsync(string name)
    {
        using var connection = await WiFiDirectConnector.ConnectAsync(name);
        Console.WriteLine("Conexão mantida por 30 segundos...");
        await Task.Delay(TimeSpan.FromSeconds(30));
        return 0;
    }

    private static async Task<int> RunWfdAsync(string name, bool stream, int seconds)
    {
        Directory.CreateDirectory("logs");
        using var listener = new TcpListener(IPAddress.Any, 7236);
        listener.Start();
        Console.WriteLine("RTSP aguardando na porta 7236.");

        using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(seconds));
        using var advertisement = new WfdAdvertisement();
        await advertisement.StartAsync();
        var acceptTask = listener.AcceptTcpClientAsync(cancellation.Token).AsTask();
        using var connection = await WiFiDirectConnector.ConnectAsync(name);

        Console.WriteLine("Aguardando a TV abrir a sessão RTSP...");
        using var tcpClient = await acceptTask.WaitAsync(TimeSpan.FromSeconds(25));
        Console.WriteLine($"RTSP conectado por {tcpClient.Client.RemoteEndPoint}");

        await using var session = new WfdSession(
            tcpClient,
            connection.LocalAddress,
            connection.RemoteAddress,
            stream);

        await session.RunAsync(cancellation.Token);
        return 0;
    }

    private static int ParseSeconds(string? value)
    {
        return int.TryParse(value, out var seconds) && seconds >= 10
            ? seconds
            : 120;
    }

    private static async Task<int> HijackNativeStackAsync(int seconds)
    {
        Directory.CreateDirectory("logs");
        using var listener = new TcpListener(IPAddress.Any, 7236);
        listener.Start();
        Console.WriteLine("Porta 7236 ocupada pelo MiracastCpu.");

        using var cancellation = new CancellationTokenSource(
            TimeSpan.FromSeconds(seconds));
        var acceptTask = listener.AcceptTcpClientAsync(
            cancellation.Token).AsTask();

        Process.Start(new ProcessStartInfo(
            Path.Combine(
                Environment.GetFolderPath(
                    Environment.SpecialFolder.Windows),
                "System32",
                "DisplaySwitch.exe"),
            "/connect")
        {
            UseShellExecute = true
        });
        Console.WriteLine(
            "Clique na Samsung no painel Transmitir e aceite na TV.");

        using var tcpClient = await acceptTask.WaitAsync(
            TimeSpan.FromSeconds(Math.Min(90, seconds)));
        var local = (IPEndPoint)tcpClient.Client.LocalEndPoint!;
        var remote = (IPEndPoint)tcpClient.Client.RemoteEndPoint!;
        Console.WriteLine(
            $"RTSP capturado: {remote.Address} -> {local.Address}:7236");

        await using var session = new WfdSession(
            tcpClient,
            local.Address.ToString(),
            remote.Address.ToString(),
            true);
        await session.RunAsync(cancellation.Token);
        return 0;
    }

    private static int Usage()
    {
        Console.WriteLine(
            "Uso:\n" +
            "  MiracastCpu list\n" +
            "  MiracastCpu connect [nome]\n" +
            "  MiracastCpu probe [nome]\n" +
            "  MiracastCpu cast [nome] [segundos]\n" +
            "  MiracastCpu hijack [segundos]\n" +
            "  MiracastCpu mft");
        return 2;
    }
}
