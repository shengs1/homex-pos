param(
    [string]$SourcePptx = "D:\tmp\homex-ppt-template-apply-20260801\PowerPoint_Bao_cao_do_an_HomeX_POS.pptx",
    [string]$OutputPptx = (Join-Path $PSScriptRoot "..\docs\PowerPoint_Bao_cao_do_an_HomeX_POS.pptx"),
    [string]$OutputPdf = (Join-Path $PSScriptRoot "..\docs\PowerPoint_Bao_cao_do_an_HomeX_POS.pdf")
)

$ErrorActionPreference = "Stop"

function Get-SlideById($presentation, [int]$slideId) {
    foreach ($slide in $presentation.Slides) {
        if ($slide.SlideID -eq $slideId) { return $slide }
    }
    throw "Khong tim thay SlideID $slideId"
}

function Set-Text($shape, [string]$value) {
    if ($shape.HasTextFrame -eq -1) {
        $shape.TextFrame.TextRange.Text = $value
    }
}

function Set-FirstTextMatching($slide, [string]$pattern, [string]$value) {
    foreach ($shape in $slide.Shapes) {
        if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
            $current = $shape.TextFrame.TextRange.Text.Trim()
            if ($current -match $pattern) {
                Set-Text $shape $value
                return
            }
        }
    }
    throw "Khong tim thay text '$pattern' tren slide $($slide.SlideIndex)"
}

$source = [System.IO.Path]::GetFullPath($SourcePptx)
$pptx = [System.IO.Path]::GetFullPath($OutputPptx)
$pdf = [System.IO.Path]::GetFullPath($OutputPdf)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($pptx)) | Out-Null

$powerPoint = New-Object -ComObject PowerPoint.Application
$presentation = $null

try {
    $presentation = $powerPoint.Presentations.Open($source, $false, $false, $false)

    # Thu tu 14 slide tu ban cu; slide ket luan duoc nhan ban thanh slide Q&A.
    $orderedIds = @(256, 258, 259, 260, 261, 262, 263, 267, 264, 269, 265, 270, 268, 271)

    foreach ($removeId in @(257, 266)) {
        (Get-SlideById $presentation $removeId).Delete()
    }

    for ($i = 0; $i -lt $orderedIds.Count; $i++) {
        (Get-SlideById $presentation $orderedIds[$i]).MoveTo($i + 1)
    }

    # Tao slide 15 tu thiet ke slide ket luan de giu nhat quan thi giac.
    $closingRange = $presentation.Slides.Item(14).Duplicate()
    $closing = $closingRange.Item(1)
    $closing.MoveTo(15)

    # Dieu chinh tieu de theo mach noi dung bao ve.
    Set-FirstTextMatching $presentation.Slides.Item(4) '^Các phân hệ chính' 'Phân tích đề tài – tác nhân và chức năng'
    Set-FirstTextMatching $presentation.Slides.Item(6) '^Use case và tác nhân' 'Use case và luồng nghiệp vụ chính'
    Set-FirstTextMatching $presentation.Slides.Item(8) '^Ba chức năng hỗ trợ' 'AI và các chức năng hỗ trợ thông minh'
    Set-FirstTextMatching $presentation.Slides.Item(9) '^Luồng bán hàng tại quầy$' 'Kết quả xây dựng – luồng bán hàng tại quầy'
    Set-FirstTextMatching $presentation.Slides.Item(13) '^Một số giao diện' 'Demo sản phẩm – các giao diện tiêu biểu'
    # Dat nhan anh vao thanh tieu de cua khung trinh duyet, khong che noi dung anh.
    $slide9 = $presentation.Slides.Item(9)
    foreach ($item in @(
        @('Rounded Rectangle 35', 234, 209), @('TextBox 36', 238, 209),
        @('Rounded Rectangle 44', 672, 209), @('TextBox 45', 676, 209)
    )) {
        $shape = $slide9.Shapes.Item($item[0])
        $shape.Left = $item[1]
        $shape.Top = $item[2]
        $shape.Height = 18
        if ($shape.HasTextFrame -eq -1) {
            $shape.TextFrame.TextRange.Font.Size = 9.5
            $shape.TextFrame.VerticalAnchor = 3
        }
    }

    $slide13 = $presentation.Slides.Item(13)
    foreach ($item in @(
        @('Rounded Rectangle 16', 234, 134), @('TextBox 17', 238, 134),
        @('Rounded Rectangle 25', 672, 134), @('TextBox 26', 676, 134),
        @('Rounded Rectangle 34', 234, 324), @('TextBox 35', 238, 324),
        @('Rounded Rectangle 43', 672, 324), @('TextBox 44', 676, 324)
    )) {
        $shape = $slide13.Shapes.Item($item[0])
        $shape.Left = $item[1]
        $shape.Top = $item[2]
        $shape.Height = 18
        if ($shape.HasTextFrame -eq -1) {
            $shape.TextFrame.TextRange.Font.Size = 9.5
            $shape.TextFrame.VerticalAnchor = 3
        }
    }

    # Slide 14: ket luan va huong phat trien, toi da 10 dong noi dung chinh.
    $conclusion = $presentation.Slides.Item(14)
    Set-Text $conclusion.Shapes.Item('TextBox 21') 'HƯỚNG PHÁT TRIỂN'
    Set-Text $conclusion.Shapes.Item('TextBox 22') 'Đa chi nhánh • dữ liệu bán thực • kiểm thử tải và người dùng'
    $conclusion.Shapes.Item('TextBox 21').Top = 394
    $conclusion.Shapes.Item('TextBox 22').Top = 438
    $conclusion.Shapes.Item('TextBox 22').Width = 650
    $conclusion.Shapes.Item('TextBox 22').TextFrame.TextRange.Font.Size = 18

    # Slide 15: trang cam on va hoi dap gon, tach khoi ket luan.
    $closing = $presentation.Slides.Item(15)
    Set-Text $closing.Shapes.Item('TextBox 3') 'CẢM ƠN'
    Set-Text $closing.Shapes.Item('TextBox 4') 'TRÂN TRỌNG CẢM ƠN THẦY VÀ CÁC BẠN ĐÃ LẮNG NGHE'
    $closing.Shapes.Item('TextBox 4').Height = 110
    $closing.Shapes.Item('TextBox 4').Width = 700
    $closing.Shapes.Item('TextBox 4').TextFrame.TextRange.Font.Size = 30

    foreach ($name in @(
        'Rounded Rectangle 5','Oval 6','TextBox 7','TextBox 8','TextBox 9',
        'Rounded Rectangle 10','Oval 11','TextBox 12','TextBox 13','TextBox 14',
        'Rounded Rectangle 15','Oval 16','TextBox 17','TextBox 18','TextBox 19',
        'Straight Connector 20'
    )) {
        $closing.Shapes.Item($name).Delete()
    }
    Set-Text $closing.Shapes.Item('TextBox 21') 'SẴN SÀNG TRAO ĐỔI VÀ DEMO HỆ THỐNG'
    Set-Text $closing.Shapes.Item('TextBox 22') 'Q & A'
    $closing.Shapes.Item('TextBox 21').Top = 300
    $closing.Shapes.Item('TextBox 21').Width = 650
    $closing.Shapes.Item('TextBox 22').Top = 356
    $closing.Shapes.Item('TextBox 22').Width = 300
    $closing.Shapes.Item('TextBox 22').TextFrame.TextRange.Font.Size = 32
    $closing.Shapes.Item('Picture 24').Left = 748
    $closing.Shapes.Item('Picture 24').Top = 292
    $closing.Shapes.Item('Picture 24').Width = 142
    $closing.Shapes.Item('Picture 24').Height = 142

    # Cap nhat so thu tu va footer sau khi sap xep.
    for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
        $slide = $presentation.Slides.Item($i)
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
                $value = $shape.TextFrame.TextRange.Text.Trim()
                if ($value -match '^\d{2} / 16$') {
                    Set-Text $shape ('{0:00} / 15' -f $i)
                }
                elseif ($shape.Top -lt 50 -and $value -match '^\d{2}$') {
                    Set-Text $shape ('{0:00}' -f $i)
                }
            }
        }
    }

    if (Test-Path -LiteralPath $pptx) { Remove-Item -LiteralPath $pptx -Force }
    if (Test-Path -LiteralPath $pdf) { Remove-Item -LiteralPath $pdf -Force }
    $presentation.SaveAs($pptx, 24)
    $presentation.SaveAs($pdf, 32)
}
finally {
    if ($null -ne $presentation) { $presentation.Close() }
    $powerPoint.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Output "Created: $pptx"
Write-Output "Created: $pdf"
