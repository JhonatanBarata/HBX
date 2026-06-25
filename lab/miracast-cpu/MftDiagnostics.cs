using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace MiracastCpu;

internal static class MftDiagnostics
{
    private const uint MfVersion = 0x00020070;
    private const uint MftEnumFlagSync = 0x00000001;
    private const uint MftEnumFlagAsync = 0x00000002;
    private const uint MftEnumFlagHardware = 0x00000004;
    private const uint MftEnumFlagAll = 0x0000003F;

    private static readonly Guid VideoEncoderCategory =
        new("F79EAC7D-E545-4387-BDEE-D647D7BDE42A");
    private static readonly Guid VideoMajorType =
        new("73646976-0000-0010-8000-00AA00389B71");
    private static readonly Guid H264Subtype =
        new("34363248-0000-0010-8000-00AA00389B71");
    private static readonly Guid FriendlyNameAttribute =
        new("314FFBAE-5B41-4C95-9C19-4E7D586FACE3");
    private static readonly Guid TransformClsidAttribute =
        new("6821C42B-65A4-4E82-99BC-9A88205ECD0C");
    private static readonly Guid HardwareUrlAttribute =
        new("2FB866AC-B078-4942-AB6C-003D05CDA674");
    private static readonly Guid ImfTransform =
        new("BF94C121-5B05-4E6F-8000-BA598961414D");

    public static int Run()
    {
        ThrowIfFailed(MFStartup(MfVersion, 0), "MFStartup");
        try
        {
            Console.WriteLine("Encoders Media Foundation com saída H.264");
            Console.WriteLine();
            Enumerate("hardware", MftEnumFlagHardware);
            Enumerate("software síncrono", MftEnumFlagSync);
            Enumerate("software assíncrono", MftEnumFlagAsync);
            Enumerate("todos", MftEnumFlagAll);
            return 0;
        }
        finally
        {
            MFShutdown();
        }
    }

    private static void Enumerate(string label, uint flags)
    {
        var output = new MftRegisterTypeInfo
        {
            MajorType = VideoMajorType,
            Subtype = H264Subtype
        };

        var result = MFTEnumEx(
            VideoEncoderCategory,
            flags,
            IntPtr.Zero,
            ref output,
            out var activationArray,
            out var count);
        ThrowIfFailed(result, $"MFTEnumEx ({label})");

        Console.WriteLine($"[{label}] {count} candidato(s)");
        try
        {
            for (var index = 0; index < count; index++)
            {
                var unknown = Marshal.ReadIntPtr(
                    activationArray,
                    checked((int)(index * (uint)IntPtr.Size)));
                if (unknown == IntPtr.Zero)
                {
                    continue;
                }

                IMFActivate? activation = null;
                try
                {
                    activation = (IMFActivate)Marshal.GetObjectForIUnknown(
                        unknown);
                    PrintActivation(activation);
                }
                finally
                {
                    Marshal.Release(unknown);
                    if (activation is not null)
                    {
                        Marshal.FinalReleaseComObject(activation);
                    }
                }
            }
        }
        finally
        {
            Marshal.FreeCoTaskMem(activationArray);
        }

        Console.WriteLine();
    }

    private static void PrintActivation(IMFActivate activation)
    {
        var name = ReadString(activation, FriendlyNameAttribute)
            ?? "(sem nome)";
        var clsidAttribute = TransformClsidAttribute;
        var clsidResult = activation.GetGUID(
            ref clsidAttribute,
            out var clsid);
        var hardwareUrl = ReadString(activation, HardwareUrlAttribute);

        Console.WriteLine($"- {name}");
        Console.WriteLine(
            clsidResult >= 0
                ? $"  CLSID: {{{clsid}}}"
                : $"  CLSID: indisponível ({FormatHResult(clsidResult)})");

        if (clsidResult >= 0)
        {
            PrintRegistryState(clsid);
        }

        if (!string.IsNullOrWhiteSpace(hardwareUrl))
        {
            Console.WriteLine($"  hardware URL: {hardwareUrl}");
        }

        var iid = ImfTransform;
        var activationResult = activation.ActivateObject(
            ref iid,
            out var transform);
        Console.WriteLine(
            activationResult >= 0
                ? "  ativação IMFTransform: OK"
                : $"  ativação IMFTransform: {FormatHResult(activationResult)}");

        if (activationResult >= 0)
        {
            try
            {
                activation.ShutdownObject();
            }
            finally
            {
                if (transform is not null &&
                    Marshal.IsComObject(transform))
                {
                    Marshal.FinalReleaseComObject(transform);
                }
            }
        }
    }

    private static void PrintRegistryState(Guid clsid)
    {
        var id = clsid.ToString("B");
        var registryId = clsid.ToString("D");
        using var transformKey = Registry.LocalMachine.OpenSubKey(
            $@"SOFTWARE\Classes\MediaFoundation\Transforms\{registryId}");
        var flags = transformKey?.GetValue("MFTFlags");

        using var classKey = Registry.LocalMachine.OpenSubKey(
            $@"SOFTWARE\Classes\CLSID\{id}\InprocServer32");
        var server = classKey?.GetValue(null) as string;

        Console.WriteLine($"  MFTFlags no registro: {flags ?? "(ausente)"}");
        Console.WriteLine($"  DLL: {server ?? "(não encontrada)"}");
    }

    private static string? ReadString(
        IMFActivate attributes,
        Guid key)
    {
        var result = attributes.GetAllocatedString(
            ref key,
            out var value,
            out _);
        if (result < 0 || value == IntPtr.Zero)
        {
            return null;
        }

        try
        {
            return Marshal.PtrToStringUni(value);
        }
        finally
        {
            Marshal.FreeCoTaskMem(value);
        }
    }

    private static void ThrowIfFailed(int result, string operation)
    {
        if (result < 0)
        {
            throw new COMException(
                $"{operation} falhou: {FormatHResult(result)}",
                result);
        }
    }

    private static string FormatHResult(int result) =>
        $"0x{unchecked((uint)result):X8} ({Marshal.GetExceptionForHR(result)?.Message})";

    [StructLayout(LayoutKind.Sequential)]
    private struct MftRegisterTypeInfo
    {
        public Guid MajorType;
        public Guid Subtype;
    }

    [DllImport("mfplat.dll", ExactSpelling = true)]
    private static extern int MFStartup(uint version, uint flags);

    [DllImport("mfplat.dll", ExactSpelling = true)]
    private static extern int MFShutdown();

    [DllImport("mfplat.dll", ExactSpelling = true)]
    private static extern int MFTEnumEx(
        [In] Guid category,
        uint flags,
        IntPtr inputType,
        [In] ref MftRegisterTypeInfo outputType,
        out IntPtr activations,
        out uint count);

    [ComImport]
    [Guid("7FEE9E9A-4A89-47A6-899C-B6A53A70FB67")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMFActivate
    {
        [PreserveSig] int GetItem(ref Guid key, IntPtr value);
        [PreserveSig] int GetItemType(ref Guid key, out int type);
        [PreserveSig] int CompareItem(
            ref Guid key,
            IntPtr value,
            out int result);
        [PreserveSig] int Compare(
            IntPtr theirs,
            int matchType,
            out int result);
        [PreserveSig] int GetUINT32(ref Guid key, out uint value);
        [PreserveSig] int GetUINT64(ref Guid key, out ulong value);
        [PreserveSig] int GetDouble(ref Guid key, out double value);
        [PreserveSig] int GetGUID(ref Guid key, out Guid value);
        [PreserveSig] int GetStringLength(ref Guid key, out uint length);
        [PreserveSig] int GetString(
            ref Guid key,
            IntPtr value,
            uint bufferSize,
            IntPtr length);
        [PreserveSig] int GetAllocatedString(
            ref Guid key,
            out IntPtr value,
            out uint length);
        [PreserveSig] int GetBlobSize(ref Guid key, out uint size);
        [PreserveSig] int GetBlob(
            ref Guid key,
            IntPtr buffer,
            uint bufferSize,
            IntPtr blobSize);
        [PreserveSig] int GetAllocatedBlob(
            ref Guid key,
            out IntPtr buffer,
            out uint size);
        [PreserveSig] int GetUnknown(
            ref Guid key,
            ref Guid iid,
            out IntPtr value);
        [PreserveSig] int SetItem(ref Guid key, IntPtr value);
        [PreserveSig] int DeleteItem(ref Guid key);
        [PreserveSig] int DeleteAllItems();
        [PreserveSig] int SetUINT32(ref Guid key, uint value);
        [PreserveSig] int SetUINT64(ref Guid key, ulong value);
        [PreserveSig] int SetDouble(ref Guid key, double value);
        [PreserveSig] int SetGUID(ref Guid key, ref Guid value);
        [PreserveSig] int SetString(
            ref Guid key,
            [MarshalAs(UnmanagedType.LPWStr)] string value);
        [PreserveSig] int SetBlob(
            ref Guid key,
            IntPtr buffer,
            uint bufferSize);
        [PreserveSig] int SetUnknown(ref Guid key, IntPtr value);
        [PreserveSig] int LockStore();
        [PreserveSig] int UnlockStore();
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetItemByIndex(
            uint index,
            out Guid key,
            IntPtr value);
        [PreserveSig] int CopyAllItems(IntPtr destination);
        [PreserveSig] int ActivateObject(
            ref Guid iid,
            [MarshalAs(UnmanagedType.IUnknown)] out object? value);
        [PreserveSig] int ShutdownObject();
        [PreserveSig] int DetachObject();
    }
}
