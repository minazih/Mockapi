<#
  deploy.ps1 - Deploy the Mock CRM API to AWS (S3 static console + Lambda API)

  Mirrors the deployment used by GenesysCloudPOC-AWS in this same account:
  a public-read S3 bucket for the page, and the API on Lambda behind an
  API Gateway HTTP API.

  Everything is idempotent - safe to re-run to ship a change.
    1. Packages the Lambda (handler.mjs + api.mjs + lib/data.mjs).
    2. Ensures an execution role (creates a minimal one unless you pass -RoleArn).
    3. Creates or updates the function.
    4. Ensures an HTTP API in front of it.
    5. Ensures the S3 bucket with public read.
    6. Uploads index.html with API_ORIGIN rewritten to the API endpoint.

  Usage:
    powershell -ExecutionPolicy Bypass -File aws/deploy.ps1 -BucketName crm-mockapi

  Example (existing bucket, under a crm/ folder):
    powershell -ExecutionPolicy Bypass -File aws/deploy.ps1 -BucketName genesys-nazih -Region eu-west-1 -KeyPrefix crm

  Parameters:
    -BucketName   (required) Globally-unique S3 bucket name. NO DOTS - HTTPS needs a
                  dot-free name to match the *.s3.<region>.amazonaws.com certificate.
                  S3 bucket names are lowercase only.
    -Region       (default eu-west-1)
    -KeyPrefix    Folder inside the bucket. Default 'crm'. Pass '' for the root.
    -RoleArn      Use an existing execution role instead of creating one (use this
                  if the account restricts IAM CreateRole).

  Prereq: AWS CLI v2 on PATH and `aws sts get-caller-identity` working.

  WHY API GATEWAY AND NOT A LAMBDA FUNCTION URL: a Function URL with AuthType NONE
  returns 403 in this org - an AWS Organizations guardrail denies anonymous
  lambda:InvokeFunctionUrl, even though public S3 and IAM invoke both work.
  API Gateway invokes the function as an authenticated service principal, so the
  public entrypoint works where a Function URL does not. Learned the hard way on
  the POC deploy next door; do not "simplify" this back to a Function URL.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BucketName,
  [string]$Region = 'eu-west-1',
  [string]$KeyPrefix = 'crm',
  [string]$FunctionName = 'crm-mockapi-run',
  [string]$ApiName = 'crm-mockapi-api',
  [string]$RoleArn = '',
  [string]$RoleName = 'crm-mockapi-lambda-role'
)

$ErrorActionPreference = 'Stop'
$AwsDir   = $PSScriptRoot
$RepoRoot = Split-Path $PSScriptRoot -Parent
$PrefixPath = if ([string]::IsNullOrWhiteSpace($KeyPrefix)) { '' } else { $KeyPrefix.Trim('/') + '/' }

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Info($m) { Write-Host "    $m" -ForegroundColor Gray }
function Ok($m)   { Write-Host "    $m" -ForegroundColor Green }

# Run the AWS CLI. Returns stdout; throws on non-zero unless -AllowFail, in which
# case it returns $null so the caller can treat failure as "does not exist".
function Aws {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs, [switch]$AllowFail)
  # Call aws.exe with the extension - a bare `aws` re-enters this function
  # (PowerShell matches names case-insensitively) and recurses until it blows up.
  $out = & aws.exe @CliArgs
  if ($LASTEXITCODE -ne 0) {
    if ($AllowFail) { return $null }
    throw "aws $($CliArgs -join ' ') failed (exit $LASTEXITCODE)"
  }
  return $out
}

# Write JSON to a temp file and return a file:// URI, which dodges every
# PowerShell and CMD quoting rule for --policy style arguments.
function New-JsonArg($json) {
  $path = Join-Path $env:TEMP ("crm-mockapi-" + [guid]::NewGuid().ToString('N') + ".json")
  [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
  return @{ Path = $path; Uri = ('file://' + ($path -replace '\\', '/')) }
}

# Build a zip with FORWARD-SLASH entry paths. Compress-Archive writes backslashes,
# and Lambda then unpacks a single file literally named "lib\data.mjs" instead of
# a lib/ directory - so `import './lib/data.mjs'` fails at cold start with a
# module-not-found that says nothing about zip encoding.
function New-Zip($fileMap, $zipPath) {
  if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Add-Type -AssemblyName System.IO.Compression | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
  $fs = [System.IO.File]::Open($zipPath, 'Create')
  $ar = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
  foreach ($entry in $fileMap.Keys) {
    $e = $ar.CreateEntry($entry, [System.IO.Compression.CompressionLevel]::Optimal)
    $w = $e.Open()
    $b = [System.IO.File]::ReadAllBytes($fileMap[$entry])
    $w.Write($b, 0, $b.Length)
    $w.Dispose()
  }
  $ar.Dispose(); $fs.Dispose()
}

# ---- 0. preconditions -------------------------------------------------------
Step "Checking prerequisites"
if (-not (Get-Command aws.exe -ErrorAction SilentlyContinue)) {
  throw "AWS CLI not found on PATH. Install AWS CLI v2 and re-run."
}
if ($BucketName -match '\.') { throw "Bucket name '$BucketName' contains a dot. Use a dot-free name so HTTPS works." }
if ($BucketName -cmatch '[A-Z]') { throw "Bucket name '$BucketName' has uppercase letters. S3 bucket names are lowercase only." }

$ApiSrc  = Join-Path $RepoRoot 'netlify/functions/api.mjs'
$DataSrc = Join-Path $RepoRoot 'netlify/functions/lib/data.mjs'
$PageSrc = Join-Path $RepoRoot 'index.html'
foreach ($f in @($ApiSrc, $DataSrc, $PageSrc)) { if (-not (Test-Path $f)) { throw "Cannot find $f" } }

$who = Aws sts get-caller-identity | ConvertFrom-Json
$AccountId = $who.Account
Info "Account $AccountId, region $Region, bucket $BucketName, prefix '$PrefixPath'"

# ---- 1. package the Lambda --------------------------------------------------
Step "Packaging the Lambda"
$zip = Join-Path $env:TEMP ("crm-mockapi-" + [guid]::NewGuid().ToString('N') + ".zip")
New-Zip @{
  'handler.mjs'  = (Join-Path $AwsDir 'lambda/handler.mjs')
  'package.json' = (Join-Path $AwsDir 'lambda/package.json')
  'api.mjs'      = $ApiSrc
  'lib/data.mjs' = $DataSrc
} $zip
$zipUri = 'fileb://' + ($zip -replace '\\', '/')
Ok ("Built {0:N1} KB" -f ((Get-Item $zip).Length / 1KB))

# ---- 2. execution role ------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($RoleArn)) {
  Step "Ensuring execution role '$RoleName'"
  $existing = Aws iam get-role --role-name $RoleName -AllowFail
  if ($null -eq $existing) {
    Info "Creating role $RoleName"
    $trust = New-JsonArg '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
    $created = Aws iam create-role --role-name $RoleName --assume-role-policy-document $trust.Uri | ConvertFrom-Json
    $RoleArn = $created.Role.Arn
    Aws iam attach-role-policy --role-name $RoleName --policy-arn 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' | Out-Null
    Remove-Item $trust.Path -Force
    Info "Waiting 10s for the new role to propagate..."
    Start-Sleep -Seconds 10
  }
  else { $RoleArn = ($existing | ConvertFrom-Json).Role.Arn }
  Ok "Role: $RoleArn"
}
else { Info "Using supplied role: $RoleArn" }

# ---- 3. create or update the function ---------------------------------------
Step "Deploying the function"
$fn = Aws lambda get-function --function-name $FunctionName --region $Region -AllowFail
if ($null -eq $fn) {
  Info "Creating function $FunctionName"
  # A brand-new role takes a moment to become assumable; retry.
  $attempt = 0
  while ($true) {
    $attempt++
    & aws.exe lambda create-function --function-name $FunctionName --region $Region `
      --runtime nodejs20.x --handler handler.handler --role $RoleArn `
      --zip-file $zipUri --timeout 30 --memory-size 256 | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    if ($attempt -ge 5) { throw "create-function failed after $attempt attempts" }
    Info "Role not assumable yet, retrying in 8s (attempt $attempt)..."
    Start-Sleep -Seconds 8
  }
  Aws lambda wait function-active-v2 --function-name $FunctionName --region $Region | Out-Null
}
else {
  Info "Updating function code"
  Aws lambda update-function-code --function-name $FunctionName --region $Region --zip-file $zipUri | Out-Null
  Aws lambda wait function-updated-v2 --function-name $FunctionName --region $Region | Out-Null
  Aws lambda update-function-configuration --function-name $FunctionName --region $Region `
    --runtime nodejs20.x --handler handler.handler --timeout 30 --memory-size 256 | Out-Null
  Aws lambda wait function-updated-v2 --function-name $FunctionName --region $Region | Out-Null
}
Ok "Function deployed"

# ---- 4. HTTP API in front of it ---------------------------------------------
Step "Ensuring the API Gateway HTTP API"
$fnArn = "arn:aws:lambda:${Region}:${AccountId}:function:${FunctionName}"
$apis = Aws apigatewayv2 get-apis --region $Region | ConvertFrom-Json
$api = $apis.Items | Where-Object { $_.Name -eq $ApiName } | Select-Object -First 1
if ($null -eq $api) {
  Info "Creating HTTP API $ApiName (quick-create: integration + `$default route + stage)"
  # Quick-create makes a $default route, so every path reaches the function and
  # api.mjs does its own routing - which is what keeps Netlify and AWS identical.
  $api = Aws apigatewayv2 create-api --name $ApiName --protocol-type HTTP --target $fnArn --region $Region | ConvertFrom-Json
  Aws lambda add-permission --function-name $FunctionName --region $Region `
    --statement-id apigw-invoke --action lambda:InvokeFunction --principal apigateway.amazonaws.com `
    --source-arn "arn:aws:execute-api:${Region}:${AccountId}:$($api.ApiId)/*" -AllowFail | Out-Null
}
else { Info "Reusing HTTP API $ApiName ($($api.ApiId))" }
$ApiEndpoint = $api.ApiEndpoint
# Deliberately NO --cors-configuration here: api.mjs already sets CORS headers and
# answers OPTIONS. Doing both emits duplicate access-control-allow-origin headers,
# which browsers reject outright.
Ok "API endpoint: $ApiEndpoint"

# ---- 5. S3 bucket -----------------------------------------------------------
Step "Ensuring the S3 bucket"
$head = Aws s3api head-bucket --bucket $BucketName -AllowFail
if ($null -eq $head) {
  Info "Creating bucket $BucketName"
  if ($Region -eq 'us-east-1') { Aws s3api create-bucket --bucket $BucketName --region $Region | Out-Null }
  else {
    Aws s3api create-bucket --bucket $BucketName --region $Region `
      --create-bucket-configuration ("LocationConstraint=$Region") | Out-Null
  }
}
Info "Opening public read access"
Aws s3api put-public-access-block --bucket $BucketName `
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" | Out-Null
$policy = New-JsonArg ('{"Version":"2012-10-17","Statement":[{"Sid":"PublicRead","Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::' + $BucketName + '/*"}]}')
Aws s3api put-bucket-policy --bucket $BucketName --policy $policy.Uri | Out-Null
Remove-Item $policy.Path -Force
Ok "Bucket ready"

# ---- 6. upload the page with API_ORIGIN rewritten ---------------------------
Step "Uploading the console (API_ORIGIN -> API Gateway)"
# On Netlify the page and the function share an origin, so API_ORIGIN is empty.
# On S3 they do not, so the page must be told where the API actually lives - and
# so must the generated data action, which has to call API Gateway rather than
# the bucket that is serving the page.
$content = [System.IO.File]::ReadAllText($PageSrc)
$needle = 'const API_ORIGIN = "";'
$replacement = 'const API_ORIGIN = "' + $ApiEndpoint + '";'
if (-not $content.Contains($needle)) {
  throw "Could not find `"$needle`" in index.html - the deploy would silently ship a page pointing at the S3 bucket."
}
$content = $content.Replace($needle, $replacement)
$outFile = Join-Path $env:TEMP ("crm-mockapi-index-" + [guid]::NewGuid().ToString('N') + ".html")
[System.IO.File]::WriteAllText($outFile, $content, (New-Object System.Text.UTF8Encoding($false)))
Aws s3 cp $outFile ("s3://$BucketName/${PrefixPath}index.html") --region $Region `
  --content-type "text/html; charset=utf-8" --cache-control "no-cache" | Out-Null
Ok "Uploaded"

# ---- 7. smoke test ----------------------------------------------------------
Step "Smoke testing the deployed API"
$probe = "$ApiEndpoint/api/v1/lookup?phoneNumber=%2B966501234001"
try {
  $r = Invoke-RestMethod -Uri $probe -Method GET -TimeoutSec 30
  if ($r.found -and $r.firstName) { Ok "Lookup returned $($r.firstName) / $($r.accountNumber)" }
  else { Write-Host "    Reachable but found=false - check the dataset." -ForegroundColor Yellow }
}
catch { Write-Host "    Smoke test failed: $($_.Exception.Message)" -ForegroundColor Yellow }

# ---- done -------------------------------------------------------------------
$pageUrl = "https://$BucketName.s3.$Region.amazonaws.com/${PrefixPath}index.html"
Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " Deployed." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Console:  $pageUrl"
Write-Host " API:      $ApiEndpoint/api/v1/lookup?phoneNumber=%2B966501234001"
Write-Host ""
Write-Host " The console's data action generator already points at the API Gateway" -ForegroundColor Gray
Write-Host " endpoint, so download it there and import straight into Genesys." -ForegroundColor Gray
Write-Host " Re-run this script any time to ship a change." -ForegroundColor Gray

Remove-Item $zip -Force -ErrorAction SilentlyContinue
Remove-Item $outFile -Force -ErrorAction SilentlyContinue
