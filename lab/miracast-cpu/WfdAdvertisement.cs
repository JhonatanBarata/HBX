using Windows.Devices.WiFiDirect;
using Windows.Security.Cryptography;

namespace MiracastCpu;

internal sealed class WfdAdvertisement : IDisposable
{
    private readonly WiFiDirectAdvertisementPublisher _publisher = new();
    private readonly TaskCompletionSource<WiFiDirectAdvertisementPublisherStatus>
        _started = new(
            TaskCreationOptions.RunContinuationsAsynchronously);

    public WfdAdvertisement()
    {
        _publisher.StatusChanged += OnStatusChanged;
        _publisher.Advertisement.ListenStateDiscoverability =
            WiFiDirectAdvertisementListenStateDiscoverability.Intensive;

        var informationElement = new WiFiDirectInformationElement
        {
            Oui = CryptographicBuffer.CreateFromByteArray(
                [0x50, 0x6F, 0x9A]),
            OuiType = 0x0A,
            Value = CryptographicBuffer.CreateFromByteArray(
                [
                    0x00,       // Device Information subelement
                    0x00, 0x06, // payload length
                    0x00,       // device flags high byte
                    0x10,       // source + session available
                    0x1C, 0x44, // RTSP port 7236
                    0x00, 0x32  // maximum throughput: 50 Mbps
                ])
        };
        _publisher.Advertisement.InformationElements.Add(informationElement);
    }

    public async Task StartAsync()
    {
        _publisher.Start();
        var status = await _started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        if (status != WiFiDirectAdvertisementPublisherStatus.Started)
        {
            throw new InvalidOperationException(
                $"Anúncio WFD não iniciou: {status}");
        }
        Console.WriteLine(
            "IE WFD anunciado: Source disponível, RTSP 7236.");
    }

    private void OnStatusChanged(
        WiFiDirectAdvertisementPublisher sender,
        WiFiDirectAdvertisementPublisherStatusChangedEventArgs args)
    {
        Console.WriteLine(
            $"Wi‑Fi Direct advertisement: {args.Status}, erro={args.Error}");
        if (args.Status is
            WiFiDirectAdvertisementPublisherStatus.Started or
            WiFiDirectAdvertisementPublisherStatus.Aborted)
        {
            _started.TrySetResult(args.Status);
        }
    }

    public void Dispose()
    {
        try
        {
            _publisher.Stop();
        }
        catch (InvalidOperationException)
        {
        }
        _publisher.StatusChanged -= OnStatusChanged;
    }
}
