import urllib.request
import json

SUPABASE_URL = 'https://afrtllehytzyeyurlfvr.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmcnRsbGVoeXR6eWV5dXJsZnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MzY5OTgsImV4cCI6MjA5OTExMjk5OH0.rgmIHH5G9RFQgnRV6RIxmC1aVZpBxc8ehBzrEYAygis'

url = f"{SUPABASE_URL}/rest/v1/libraries?id=eq.LIB-H2"

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
}

data = {
    "id": "LIB-RCEES",
    "name": "RCEES Library"
}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers, method='PATCH')

try:
    with urllib.request.urlopen(req) as response:
        print("Status code:", response.getcode())
        print("Updated LIB-H2 to LIB-RCEES and RCEES Library.")
except Exception as e:
    print("Error:", e)
    
    # Try updating by old ID if LIB-H2 doesn't work, maybe ID is already LIB-RCEES but name is wrong?
    url2 = f"{SUPABASE_URL}/rest/v1/libraries?id=eq.LIB-RCEES"
    req2 = urllib.request.Request(url2, data=json.dumps({"name": "RCEES Library"}).encode('utf-8'), headers=headers, method='PATCH')
    try:
        with urllib.request.urlopen(req2) as res:
            print("Status code for second attempt:", res.getcode())
            print("Updated name for LIB-RCEES.")
    except Exception as e2:
        print("Error on second attempt:", e2)
