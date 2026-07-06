from vapid import Vapid
import json

vapid = Vapid()
vapid.generate_keys()

keys = {
    "private_key": vapid.private_pem().decode('utf-8'),
    "public_key": vapid.public_pem().decode('utf-8'),
    "public_key_b64": vapid.public_key.to_b64url()
}

with open("vapid_keys.json", "w") as f:
    json.dump(keys, f, indent=4)

print("VAPID keys generated and saved to vapid_keys.json")
