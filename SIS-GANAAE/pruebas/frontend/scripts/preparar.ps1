# Prepara node_modules de pruebas: instala dependencias y enlaza (junction) react / react-dom
# a la copia de frontend-reactjs para que exista UNA sola copia de React.
# No modifica nada fuera de pruebas/frontend.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$app  = Resolve-Path (Join-Path $raiz '..\..\frontend-reactjs\node_modules')
Push-Location $raiz
npm install
foreach ($p in 'react','react-dom') {
  $dest = Join-Path $raiz "node_modules\$p"
  if (Test-Path $dest) {
    $it = Get-Item $dest
    # Solo eliminar si es una carpeta real (copia de peer-dep); un junction se elimina sin tocar el destino.
    if ($it.LinkType -eq 'Junction') { $it.Delete() } else { Remove-Item -Recurse -Force $dest -Confirm:$false }
  }
  New-Item -ItemType Junction -Path $dest -Target (Join-Path $app $p) | Out-Null
}
Pop-Location
Write-Host 'Listo: react/react-dom enlazados a frontend-reactjs/node_modules'
