Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-ArgbColor {
  param(
    [int]$A,
    [int]$R,
    [int]$G,
    [int]$B
  )

  return [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

function Draw-SteamPromoIcon {
  param(
    [int]$Size,
    [string]$OutputPath
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

      $padding = [single]($Size * 0.04)
      $diameter = [single]($Size - ($padding * 2))
      $circleRect = [System.Drawing.RectangleF]::new($padding, $padding, $diameter, $diameter)
      $circlePath = [System.Drawing.Drawing2D.GraphicsPath]::new()
      $circlePath.AddEllipse($circleRect)

      try {
        $baseBrush = [System.Drawing.Drawing2D.PathGradientBrush]::new($circlePath)

        try {
          $baseBrush.CenterPoint = [System.Drawing.PointF]::new([single]($Size * 0.35), [single]($Size * 0.28))
          $baseBrush.CenterColor = (New-ArgbColor -A 255 -R 70 -G 165 -B 246)
          $baseBrush.SurroundColors = [System.Drawing.Color[]]@(
            (New-ArgbColor -A 255 -R 16 -G 73 -B 148)
          )

          $graphics.FillPath($baseBrush, $circlePath)
        }
        finally {
          $baseBrush.Dispose()
        }

        $overlayBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
          [System.Drawing.PointF]::new(0, 0),
          [System.Drawing.PointF]::new([single]$Size, [single]$Size),
          (New-ArgbColor -A 75 -R 255 -G 255 -B 255),
          (New-ArgbColor -A 0 -R 255 -G 255 -B 255)
        )

        try {
          $blend = [System.Drawing.Drawing2D.ColorBlend]::new()
          $blend.Colors = [System.Drawing.Color[]]@(
            (New-ArgbColor -A 34 -R 255 -G 255 -B 255),
            (New-ArgbColor -A 12 -R 255 -G 255 -B 255),
            (New-ArgbColor -A 0 -R 255 -G 255 -B 255)
          )
          $blend.Positions = [single[]]@(0.0, 0.35, 1.0)
          $overlayBrush.InterpolationColors = $blend
          $graphics.FillPath($overlayBrush, $circlePath)
        }
        finally {
          $overlayBrush.Dispose()
        }

        $highlightBrush = [System.Drawing.SolidBrush]::new((New-ArgbColor -A 24 -R 255 -G 255 -B 255))
        try {
          $graphics.FillEllipse(
            $highlightBrush,
            [single]($Size * 0.13),
            [single]($Size * 0.07),
            [single]($Size * 0.42),
            [single]($Size * 0.28)
          )
        }
        finally {
          $highlightBrush.Dispose()
        }

        $outerStroke = [System.Drawing.Pen]::new((New-ArgbColor -A 112 -R 9 -G 43 -B 92), [single][Math]::Max(1.0, $Size * 0.028))
        try {
          $graphics.DrawEllipse($outerStroke, $circleRect)
        }
        finally {
          $outerStroke.Dispose()
        }

        $innerInset = [single]($Size * 0.075)
        $innerRect = [System.Drawing.RectangleF]::new(
          $padding + $innerInset,
          $padding + $innerInset,
          $diameter - ($innerInset * 2),
          $diameter - ($innerInset * 2)
        )
        $innerStroke = [System.Drawing.Pen]::new((New-ArgbColor -A 22 -R 255 -G 255 -B 255), [single][Math]::Max(1.0, $Size * 0.016))
        try {
          $graphics.DrawEllipse($innerStroke, $innerRect)
        }
        finally {
          $innerStroke.Dispose()
        }

        $topCenter = [System.Drawing.PointF]::new([single]($Size * 0.34), [single]($Size * 0.33))
        $bottomCenter = [System.Drawing.PointF]::new([single]($Size * 0.66), [single]($Size * 0.67))
        $circleRadius = [single]($Size * 0.085)
        $lineWidth = [single][Math]::Max(1.5, $Size * 0.085)
        $shadowOffset = [single][Math]::Max(1.0, $Size * 0.03)
        $slashStart = [System.Drawing.PointF]::new([single]($Size * 0.28), [single]($Size * 0.73))
        $slashEnd = [System.Drawing.PointF]::new([single]($Size * 0.72), [single]($Size * 0.27))

        $shadowPen = [System.Drawing.Pen]::new((New-ArgbColor -A 78 -R 6 -G 29 -B 61), $lineWidth)
        try {
          $shadowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
          $shadowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
          $graphics.DrawLine(
            $shadowPen,
            [single]($slashStart.X + $shadowOffset),
            [single]($slashStart.Y + $shadowOffset),
            [single]($slashEnd.X + $shadowOffset),
            [single]($slashEnd.Y + $shadowOffset)
          )
        }
        finally {
          $shadowPen.Dispose()
        }

        $shadowBrush = [System.Drawing.SolidBrush]::new((New-ArgbColor -A 64 -R 6 -G 29 -B 61))
        try {
          $shadowDiameter = [single]($circleRadius * 2)
          $graphics.FillEllipse(
            $shadowBrush,
            [single]($topCenter.X - $circleRadius + $shadowOffset),
            [single]($topCenter.Y - $circleRadius + $shadowOffset),
            $shadowDiameter,
            $shadowDiameter
          )
          $graphics.FillEllipse(
            $shadowBrush,
            [single]($bottomCenter.X - $circleRadius + $shadowOffset),
            [single]($bottomCenter.Y - $circleRadius + $shadowOffset),
            $shadowDiameter,
            $shadowDiameter
          )
        }
        finally {
          $shadowBrush.Dispose()
        }

        $percentPen = [System.Drawing.Pen]::new((New-ArgbColor -A 255 -R 255 -G 255 -B 255), $lineWidth)
        try {
          $percentPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
          $percentPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
          $graphics.DrawLine(
            $percentPen,
            $slashStart.X,
            $slashStart.Y,
            $slashEnd.X,
            $slashEnd.Y
          )
        }
        finally {
          $percentPen.Dispose()
        }

        $percentBrush = [System.Drawing.SolidBrush]::new((New-ArgbColor -A 255 -R 255 -G 255 -B 255))
        try {
          $percentDiameter = [single]($circleRadius * 2)
          $graphics.FillEllipse(
            $percentBrush,
            [single]($topCenter.X - $circleRadius),
            [single]($topCenter.Y - $circleRadius),
            $percentDiameter,
            $percentDiameter
          )
          $graphics.FillEllipse(
            $percentBrush,
            [single]($bottomCenter.X - $circleRadius),
            [single]($bottomCenter.Y - $circleRadius),
            $percentDiameter,
            $percentDiameter
          )
        }
        finally {
          $percentBrush.Dispose()
        }
      }
      finally {
        $circlePath.Dispose()
      }
    }
    finally {
      $graphics.Dispose()
    }

    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $bitmap.Dispose()
  }
}

$outputDirectory = $PSScriptRoot
$sizes = @(16, 32, 48, 128)

foreach ($size in $sizes) {
  $outputPath = Join-Path $outputDirectory ("icon{0}.png" -f $size)
  Draw-SteamPromoIcon -Size $size -OutputPath $outputPath
}
