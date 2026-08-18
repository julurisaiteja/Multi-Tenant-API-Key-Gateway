Write-Host "=== REQ 5: Invalid Key (expect 401) ==="
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/protected" -Method GET -Headers @{"Authorization"="Bearer invalid_key_xyz"} -ErrorAction Stop
    Write-Host "FAIL: Got $($r.StatusCode) instead of 401"
} catch {
    Write-Host "PASS: Status $($_.Exception.Response.StatusCode.value__) (expected 401)"
}

Write-Host ""
Write-Host "=== REQ 5: No Auth Header (expect 401) ==="
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/protected" -Method GET -ErrorAction Stop
    Write-Host "FAIL: Got $($r.StatusCode) instead of 401"
} catch {
    Write-Host "PASS: Status $($_.Exception.Response.StatusCode.value__) (expected 401)"
}

Write-Host ""
Write-Host "=== REQ 6: Rate Limiting - Issue key with limit=5 ==="
$body5 = [PSCustomObject]@{ rateLimitPerMinute = 5 } | ConvertTo-Json
$resp5 = Invoke-RestMethod -Uri "http://localhost:3000/api/tenants/1/keys" -Method POST -Body $body5 -ContentType "application/json"
$key5 = $resp5.apiKey
$keyId5 = $resp5.keyRecord.id
Write-Host "Issued key ID=$keyId5 with limit=5"
Write-Host "Firing 6 rapid requests..."

for ($i = 1; $i -le 6; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/api/protected" -Method GET -Headers @{"Authorization"="Bearer $key5"} -ErrorAction Stop
        Write-Host "  Request $i -> $($r.StatusCode) OK"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $retryAfterHeader = $_.Exception.Response.Headers["Retry-After"]
        if ($retryAfterHeader) {
            Write-Host "  Request $i -> $code Too Many Requests (Retry-After: $retryAfterHeader s) PASS"
        } else {
            Write-Host "  Request $i -> $code (no Retry-After header!)"
        }
    }
}

Write-Host ""
Write-Host "=== REQ 7: Key Revocation ==="
$bodyRev = [PSCustomObject]@{ rateLimitPerMinute = 100 } | ConvertTo-Json
$respRev = Invoke-RestMethod -Uri "http://localhost:3000/api/tenants/1/keys" -Method POST -Body $bodyRev -ContentType "application/json"
$keyRev = $respRev.apiKey
$keyIdRev = $respRev.keyRecord.id
Write-Host "Issued revocation test key ID=$keyIdRev"

# Verify it works first
$preRevoke = Invoke-WebRequest -Uri "http://localhost:3000/api/protected" -Method GET -Headers @{"Authorization"="Bearer $keyRev"} -ErrorAction Stop
Write-Host "Before revoke: $($preRevoke.StatusCode) OK"

# Revoke it
$revokeResp = Invoke-WebRequest -Uri "http://localhost:3000/api/keys/$keyIdRev" -Method DELETE -ErrorAction Stop
Write-Host "Revoke response: $($revokeResp.StatusCode) (expected 204)"

# Verify it's now rejected
try {
    $postRevoke = Invoke-WebRequest -Uri "http://localhost:3000/api/protected" -Method GET -Headers @{"Authorization"="Bearer $keyRev"} -ErrorAction Stop
    Write-Host "FAIL: Key still works after revocation!"
} catch {
    Write-Host "PASS: After revoke: $($_.Exception.Response.StatusCode.value__) (expected 401)"
}

Write-Host ""
Write-Host "=== REQ 9: Audit Log ==="
$auditResp = Invoke-RestMethod -Uri "http://localhost:3000/api/tenants/1/audit-logs?page=1&limit=5" -Method GET
Write-Host "Total audit log entries: $($auditResp.pagination.total)"
Write-Host "Last 3 entries:"
$auditResp.logs | Select-Object -First 3 | ForEach-Object {
    Write-Host "  api_key_id=$($_.api_key_id) | endpoint=$($_.endpoint) | status=$($_.status_code)"
}
