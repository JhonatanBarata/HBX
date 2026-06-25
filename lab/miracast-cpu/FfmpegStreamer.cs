using System.Diagnostics;

namespace MiracastCpu;

internal sealed class FfmpegStreamer : IDisposable
{
    private readonly Process _process;

    private FfmpegStreamer(Process process)
    {
        _process = process;
    }

    public static FfmpegStreamer Start(
        string remoteAddress,
        int remoteRtpPort,
        int localRtpPort,
        string logPath)
    {
        var executable = FindFfmpeg();
        var startInfo = new ProcessStartInfo(executable)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardOutput = true
        };

        foreach (var argument in BuildArguments(
                     remoteAddress,
                     remoteRtpPort,
                     localRtpPort))
        {
            startInfo.ArgumentList.Add(argument);
        }

        var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("FFmpeg não iniciou.");
        var log = new StreamWriter(
            File.Open(logPath, FileMode.Create, FileAccess.Write, FileShare.Read))
        {
            AutoFlush = true
        };
        process.ErrorDataReceived += (_, eventArgs) =>
        {
            if (eventArgs.Data is not null)
            {
                log.WriteLine(eventArgs.Data);
            }
        };
        process.OutputDataReceived += (_, eventArgs) =>
        {
            if (eventArgs.Data is not null)
            {
                log.WriteLine(eventArgs.Data);
            }
        };
        process.Exited += (_, _) => log.Dispose();
        process.EnableRaisingEvents = true;
        process.BeginErrorReadLine();
        process.BeginOutputReadLine();
        return new FfmpegStreamer(process);
    }

    private static IEnumerable<string> BuildArguments(
        string remoteAddress,
        int remoteRtpPort,
        int localRtpPort)
    {
        return
        [
            "-hide_banner",
            "-loglevel", "info",
            "-f", "gdigrab",
            "-framerate", "30",
            "-draw_mouse", "1",
            "-i", "desktop",
            "-an",
            "-vf",
            "scale=1280:720:force_original_aspect_ratio=decrease," +
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-profile:v", "baseline",
            "-level:v", "3.1",
            "-b:v", "5000k",
            "-maxrate", "6000k",
            "-bufsize", "1000k",
            "-g", "30",
            "-keyint_min", "30",
            "-bf", "0",
            "-x264-params",
            "scenecut=0:ref=1:sliced-threads=1:slices=4:aud=1",
            "-mpegts_flags", "+resend_headers",
            "-muxdelay", "0",
            "-muxpreload", "0",
            "-f", "rtp_mpegts",
            $"rtp://{remoteAddress}:{remoteRtpPort}" +
            $"?rtcpport={remoteRtpPort + 1}" +
            $"&localrtpport={localRtpPort}" +
            $"&localrtcpport={localRtpPort + 1}" +
            "&pkt_size=1316"
        ];
    }

    private static string FindFfmpeg()
    {
        var fromPath = Environment.GetEnvironmentVariable("PATH")?
            .Split(Path.PathSeparator)
            .Select(path => Path.Combine(path, "ffmpeg.exe"))
            .FirstOrDefault(File.Exists);
        if (fromPath is not null)
        {
            return fromPath;
        }

        var packageRoot = Path.Combine(
            Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData),
            "Microsoft",
            "WinGet",
            "Packages");
        var match = Directory.Exists(packageRoot)
            ? Directory.EnumerateFiles(
                    packageRoot,
                    "ffmpeg.exe",
                    SearchOption.AllDirectories)
                .FirstOrDefault()
            : null;

        return match
            ?? throw new FileNotFoundException("ffmpeg.exe não encontrado.");
    }

    public void Dispose()
    {
        if (!_process.HasExited)
        {
            _process.Kill(true);
            _process.WaitForExit(3000);
        }
        _process.Dispose();
    }
}
