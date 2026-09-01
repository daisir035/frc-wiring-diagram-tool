Add-Type -AssemblyName System.Drawing

$partsDir = Join-Path $PSScriptRoot '..\public\parts\ftc'

function Export-Crop {
  param(
    [string]$Source,
    [string]$Destination,
    [System.Drawing.Rectangle]$Crop
  )

  $sourcePath = Join-Path $partsDir $Source
  $destinationPath = Join-Path $partsDir $Destination
  $image = [System.Drawing.Bitmap]::FromFile($sourcePath)
  try {
    $result = New-Object System.Drawing.Bitmap $Crop.Width, $Crop.Height
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($result)
      try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage(
          $image,
          [System.Drawing.Rectangle]::new(0, 0, $Crop.Width, $Crop.Height),
          $Crop,
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally {
        $graphics.Dispose()
      }
      $result.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $result.Dispose()
    }
  } finally {
    $image.Dispose()
  }
}

Export-Crop 'REV Driver Hub.png' 'REV Driver Hub Cropped.png' ([System.Drawing.Rectangle]::new(120, 55, 560, 475))
Export-Crop 'HD Mini Chart.png' 'REV HD Hex Motor Cropped.png' ([System.Drawing.Rectangle]::new(450, 35, 1180, 550))
Export-Crop 'REV Core Hex Motor.png' 'REV Core Hex Motor Cropped.png' ([System.Drawing.Rectangle]::new(25, 30, 390, 305))
Export-Crop 'REV Smart Robot Servo V2.png' 'REV Smart Robot Servo V2 Cropped.png' ([System.Drawing.Rectangle]::new(320, 75, 1180, 610))
Export-Crop 'REV Color Sensor V3.png' 'REV Color Sensor V3 Cropped.png' ([System.Drawing.Rectangle]::new(135, 15, 520, 430))
Export-Crop 'REV 2m Distance Sensor.png' 'REV 2m Distance Sensor Cropped.png' ([System.Drawing.Rectangle]::new(220, 15, 220, 170))
Export-Crop 'REV Touch Sensor.png' 'REV Touch Sensor Cropped.png' ([System.Drawing.Rectangle]::new(245, 10, 265, 220))
Export-Crop 'REV Through Bore Encoder V2.png' 'REV Through Bore Encoder V2 Cropped.png' ([System.Drawing.Rectangle]::new(175, 80, 660, 810))
Export-Crop 'REV 12V Slim Battery.png' 'REV 12V Slim Battery Cropped.png' ([System.Drawing.Rectangle]::new(150, 345, 1010, 660))
Export-Crop 'REV Switch Cable and Bracket.png' 'REV Switch Cable and Bracket Cropped.png' ([System.Drawing.Rectangle]::new(35, 240, 1210, 835))
