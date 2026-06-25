using Windows.Devices.Enumeration;
using Windows.Devices.WiFiDirect;

namespace MiracastCpu;

internal sealed class WiFiDirectConnection : IDisposable
{
    public WiFiDirectConnection(
        WiFiDirectDevice device,
        string localAddress,
        string remoteAddress)
    {
        Device = device;
        LocalAddress = localAddress;
        RemoteAddress = remoteAddress;
    }

    public WiFiDirectDevice Device { get; }
    public string LocalAddress { get; }
    public string RemoteAddress { get; }

    public void Dispose() => Device.Dispose();
}

internal static class WiFiDirectConnector
{
    public static async Task<int> ListAsync()
    {
        foreach (var selectorType in Enum.GetValues<WiFiDirectDeviceSelectorType>())
        {
            Console.WriteLine($"[{selectorType}]");
            var selector = WiFiDirectDevice.GetDeviceSelector(selectorType);
            var devices = await DeviceInformation.FindAllAsync(selector);

            foreach (var device in devices)
            {
                Console.WriteLine(
                    $"- {device.Name} | enabled={device.IsEnabled} | paired={device.Pairing.IsPaired}\n  {device.Id}");
            }

            Console.WriteLine($"Total: {devices.Count}\n");
        }

        return 0;
    }

    public static async Task<WiFiDirectConnection> ConnectAsync(string name)
    {
        var selector = WiFiDirectDevice.GetDeviceSelector(
            WiFiDirectDeviceSelectorType.DeviceInterface);
        var devices = await DeviceInformation.FindAllAsync(selector);
        var match = devices.FirstOrDefault(
            item => item.Name.Contains(name, StringComparison.OrdinalIgnoreCase));

        if (match is null)
        {
            throw new InvalidOperationException(
                $"Dispositivo contendo '{name}' não foi encontrado.");
        }

        Console.WriteLine($"Conectando a {match.Name}");
        var parameters = new WiFiDirectConnectionParameters
        {
            GroupOwnerIntent = 15,
            PreferredPairingProcedure =
                WiFiDirectPairingProcedure.GroupOwnerNegotiation
        };
        parameters.PreferenceOrderedConfigurationMethods.Add(
            WiFiDirectConfigurationMethod.PushButton);

        var device = await WiFiDirectDevice.FromIdAsync(match.Id, parameters);
        if (device is null)
        {
            throw new InvalidOperationException("FromIdAsync retornou null.");
        }

        var endpoint = device.GetConnectionEndpointPairs().FirstOrDefault()
            ?? throw new InvalidOperationException(
                "A conexão não forneceu endereços IP.");
        var local = endpoint.LocalHostName.CanonicalName;
        var remote = endpoint.RemoteHostName.CanonicalName;

        Console.WriteLine(
            $"Wi‑Fi Direct conectado: local={local}, TV={remote}");
        return new WiFiDirectConnection(device, local, remote);
    }
}
