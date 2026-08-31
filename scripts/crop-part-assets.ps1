Add-Type -AssemblyName System.Drawing

$partsDir = Join-Path $PSScriptRoot '..\public\parts'

function Export-Crop {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][System.Drawing.Rectangle]$Bounds
  )

  $sourcePath = Join-Path $partsDir $Source
  $destinationPath = Join-Path $partsDir $Destination
  $image = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($Bounds.Width, $Bounds.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage(
          $image,
          [System.Drawing.Rectangle]::new(0, 0, $Bounds.Width, $Bounds.Height),
          $Bounds,
          [System.Drawing.GraphicsUnit]::Pixel
        )
      }
      finally {
        $graphics.Dispose()
      }
      $bitmap.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $bitmap.Dispose()
    }
  }
  finally {
    $image.Dispose()
  }
}

Export-Crop 'CTRE PDP 2.0.png' 'CTRE PDP 2.0 Cropped.png' ([System.Drawing.Rectangle]::new(215, 80, 600, 820))
Export-Crop 'Mini Power Distribution Board.png' 'Mini Power Distribution Board Cropped.png' ([System.Drawing.Rectangle]::new(20, 20, 1020, 960))
Export-Crop 'Limelight 3 Drawing.png' 'Limelight 3 Technical.png' ([System.Drawing.Rectangle]::new(1210, 150, 950, 760))
Export-Crop 'Limelight 4 Drawing.png' 'Limelight 4 Technical.png' ([System.Drawing.Rectangle]::new(1340, 80, 620, 660))
