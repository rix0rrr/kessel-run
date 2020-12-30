[Net.ServicePointManager]::SecurityProtocol = "tls12, tls11, tls"
    $ScriptWebArchive = "https://github.com/parsec-cloud/Parsec-Cloud-Preparation-Tool/archive/master.zip"
    $LocalArchivePath = "$ENV:UserProfile\Downloads\Parsec-Cloud-Preparation-Tool"
    (New-Object System.Net.WebClient).DownloadFile($ScriptWebArchive, "$LocalArchivePath.zip")
    Expand-Archive "$LocalArchivePath.zip" -DestinationPath $LocalArchivePath -Force
    CD $LocalArchivePath\Parsec-Cloud-Preparation-Tool-master\ | powershell.exe .\loader.ps1