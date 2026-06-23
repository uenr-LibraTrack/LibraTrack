import urllib.request
import json

data = {"test": "data"}
req = urllib.request.Request("http://localhost:8081/api/state", data=json.dumps(data).encode('utf-8'), method="POST", headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as f:
        print("Response:", f.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)
