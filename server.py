import http.server
import socketserver
import json
import os
import traceback
import urllib.request
import urllib.error


PORT = int(os.environ.get('PORT', 8081))
DATA_FILE = 'database.json'
NOTIFS_FILE = 'notifications.json'
SUBSCRIPTIONS_FILE = 'subscriptions.json'
VAPID_KEYS_FILE = 'vapid_keys.json'

try:
    from pywebpush import webpush, WebPushException
except ImportError:
    print("Warning: pywebpush not installed. Push notifications will not work.")

def load_data(file_path, default):
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
                if data:  # Ensure it's not empty
                    return data
            except Exception as e:
                print(f"Error loading {file_path}: {e}")
    return default

def save_data(file_path, data):
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

class CustomAPIHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow Cross-Origin requests just in case
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/state':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            data = load_data(DATA_FILE, {})
            self.wfile.write(json.dumps(data).encode('utf-8'))
        elif self.path == '/api/notifications':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            data = load_data(NOTIFS_FILE, {})
            self.wfile.write(json.dumps(data).encode('utf-8'))
        elif self.path == '/api/vapid_public_key':
            keys = load_data(VAPID_KEYS_FILE, {})
            if "public_key_b64" in keys:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"publicKey": keys["public_key_b64"]}).encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'{"error": "VAPID keys not generated"}')
        else:
            # Fallback to serving static files
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/state':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                try:
                    state = json.loads(post_data.decode('utf-8'))
                    save_data(DATA_FILE, state)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
                    return
                except Exception as e:
                    print("Error parsing state POST:", e)
            self.send_response(400)
            self.end_headers()

        elif self.path == '/api/notifications':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                try:
                    state = json.loads(post_data.decode('utf-8'))
                    save_data(NOTIFS_FILE, state)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
                    return
                except Exception as e:
                    print("Error parsing notifications POST:", e)
            self.send_response(400)
            self.end_headers()
            
        elif self.path == '/api/subscribe':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                try:
                    sub = json.loads(post_data.decode('utf-8'))
                    subs = load_data(SUBSCRIPTIONS_FILE, [])
                    # check if already exists by endpoint
                    if not any(s.get('endpoint') == sub.get('endpoint') for s in subs):
                        subs.append(sub)
                        save_data(SUBSCRIPTIONS_FILE, subs)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
                    return
                except Exception as e:
                    print("Error parsing subscription POST:", e)
            self.send_response(400)
            self.end_headers()
            
        elif self.path == '/api/send_push':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                try:
                    payload = post_data.decode('utf-8')
                    subs = load_data(SUBSCRIPTIONS_FILE, [])
                    keys = load_data(VAPID_KEYS_FILE, {})
                    
                    if "private_key" not in keys:
                        print("Missing VAPID private key")
                        self.send_response(500)
                        self.end_headers()
                        return
                        
                    for sub in subs:
                        try:
                            webpush(
                                subscription_info=sub,
                                data=payload,
                                vapid_private_key=keys["private_key"],
                                vapid_claims={
                                    "sub": "mailto:admin@uenr.edu.gh"
                                }
                            )
                        except WebPushException as ex:
                            print("Push failed:", ex)
                            
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok", "sent_to": len(subs)}).encode('utf-8'))
                    return
                except Exception as e:
                    print("Error sending push:", e)
                    traceback.print_exc()
            self.send_response(400)
            self.end_headers()

        elif self.path == '/api/set_gemini_key':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                try:
                    request_body = json.loads(post_data.decode('utf-8'))
                    new_key = request_body.get('gemini_key', '').strip()
                    
                    # Update .env file
                    env_lines = []
                    key_updated = False
                    if os.path.exists('.env'):
                        with open('.env', 'r', encoding='utf-8') as env_file:
                            for line in env_file:
                                if line.strip().startswith('GEMINI_API_KEY='):
                                    env_lines.append(f"GEMINI_API_KEY={new_key}\n")
                                    key_updated = True
                                else:
                                    env_lines.append(line)
                    
                    if not key_updated:
                        env_lines.append(f"GEMINI_API_KEY={new_key}\n")
                    
                    with open('.env', 'w', encoding='utf-8') as env_file:
                        env_file.writelines(env_lines)
                        
                    # Update in-memory environment variable
                    os.environ['GEMINI_API_KEY'] = new_key
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
                    return
                except Exception as e:
                    print("Error updating Gemini API key:", e)
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    return
            self.send_response(400)
            self.end_headers()

        elif self.path == '/api/chat':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                try:
                    request_body = json.loads(post_data.decode('utf-8'))
                    raw_contents = request_body.get('contents', [])
                    raw_sys_inst = request_body.get('systemInstruction', '')

                    # Extract string system instruction if passed as object
                    if isinstance(raw_sys_inst, dict):
                        parts = raw_sys_inst.get('parts', [])
                        if parts and isinstance(parts[0], dict):
                            raw_sys_inst = parts[0].get('text', '')
                        else:
                            raw_sys_inst = str(raw_sys_inst)

                    # Sanitize contents: Ensure first role is 'user' and roles alternate
                    contents = []
                    first_user_idx = -1
                    for idx, item in enumerate(raw_contents):
                        if isinstance(item, dict) and item.get('role') == 'user':
                            first_user_idx = idx
                            break

                    if first_user_idx != -1:
                        last_role = None
                        for item in raw_contents[first_user_idx:]:
                            if not isinstance(item, dict):
                                continue
                            role = 'user' if item.get('role') == 'user' else 'model'
                            if role == last_role and contents:
                                text_val = item.get('parts', [{}])[0].get('text', '')
                                contents[-1]['parts'][0]['text'] += f"\n{text_val}"
                            else:
                                contents.append({
                                    "role": role,
                                    "parts": item.get('parts', [{"text": ""}])
                                })
                                last_role = role

                    # Fetch API Key from environment variable or .env
                    api_key = os.environ.get('GEMINI_API_KEY')
                    if not api_key:
                        if os.path.exists('.env'):
                            with open('.env', 'r', encoding='utf-8') as env_file:
                                for line in env_file:
                                    if line.strip().startswith('GEMINI_API_KEY='):
                                        api_key = line.strip().split('=', 1)[1].strip().strip('"').strip("'")
                                        break
                    
                    if not api_key or not api_key.strip():
                        self.send_response(400)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": "GEMINI_API_KEY not configured on server"}).encode('utf-8'))
                        return

                    # Build Gemini request payload
                    gemini_payload = {
                        "contents": contents
                    }
                    if raw_sys_inst:
                        gemini_payload["systemInstruction"] = {
                            "parts": [{"text": str(raw_sys_inst)}]
                        }

                    # Try models in order (gemini-1.5-flash -> gemini-2.0-flash)
                    models_to_try = ['gemini-1.5-flash', 'gemini-2.0-flash']
                    last_exception = None

                    for model in models_to_try:
                        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key.strip()}"
                        req = urllib.request.Request(
                            url,
                            data=json.dumps(gemini_payload).encode('utf-8'),
                            headers={'Content-Type': 'application/json'},
                            method='POST'
                        )

                        try:
                            with urllib.request.urlopen(req, timeout=15) as res:
                                response_data = json.loads(res.read().decode('utf-8'))
                                candidates = response_data.get('candidates', [])
                                if candidates and len(candidates) > 0:
                                    text_response = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                                    self.send_response(200)
                                    self.send_header('Content-Type', 'application/json')
                                    self.end_headers()
                                    self.wfile.write(json.dumps({"text": text_response}).encode('utf-8'))
                                    return
                                else:
                                    raise Exception("Empty response from Gemini API")
                        except urllib.error.HTTPError as he:
                            error_content = he.read().decode('utf-8')
                            print(f"Gemini API ({model}) HTTP Error: {he.code} - {error_content}")
                            last_exception = (he.code, error_content)
                        except Exception as e:
                            print(f"Error calling Gemini API ({model}):", e)
                            last_exception = (500, json.dumps({"error": str(e)}))

                    if last_exception:
                        status_code, err_msg = last_exception
                        self.send_response(status_code)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(err_msg.encode('utf-8') if isinstance(err_msg, str) else err_msg)
                        return

                except Exception as e:
                    print("Error parsing chat POST:", e)
            self.send_response(400)
            self.end_headers()

        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    # Change directory to the folder containing this script so it serves the right files
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), CustomAPIHandler) as httpd:
        print(f"Server starting on port {PORT}...")
        print(f"API Endpoints available: /api/state, /api/notifications, /api/subscribe, /api/send_push")
        print(f"Access it locally at: http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
