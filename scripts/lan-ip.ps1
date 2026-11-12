# Prints this PC's network address (the adapter holding the default route), for LiveKit in `make up`.
# A file instead of an inline command so make can call it from Git Bash and from PowerShell (cmd.exe) alike.
$config = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if ($config) { [Console]::Write(($config.IPv4Address | Select-Object -First 1).IPAddress) }
