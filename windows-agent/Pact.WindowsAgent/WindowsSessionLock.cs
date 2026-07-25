using System.Runtime.InteropServices;

namespace Pact.WindowsAgent;

public sealed class WindowsSessionLock : IWindowsSessionLock
{
    public bool IsSupported => OperatingSystem.IsWindows();

    public bool Lock() => IsSupported && LockWorkStation();

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool LockWorkStation();
}
