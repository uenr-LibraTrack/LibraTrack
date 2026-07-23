import http.server
import socketserver
import json
import os
import traceback
import urllib.request
import urllib.error
import urllib.parse


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
                    
                    text_response = None

                    # 1. Try Gemini API if a valid-looking API Key is set (starts with AIza)
                    if api_key and api_key.strip() and api_key.strip().startswith('AIza'):
                        gemini_payload = {
                            "contents": contents
                        }
                        if raw_sys_inst:
                            gemini_payload["systemInstruction"] = {
                                "parts": [{"text": str(raw_sys_inst)}]
                            }

                        models_to_try = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b', 'gemini-2.5-flash']

                        for model in models_to_try:
                            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key.strip()}"
                            req = urllib.request.Request(
                                url,
                                data=json.dumps(gemini_payload).encode('utf-8'),
                                headers={'Content-Type': 'application/json'},
                                method='POST'
                            )

                            try:
                                with urllib.request.urlopen(req, timeout=12) as res:
                                    response_data = json.loads(res.read().decode('utf-8'))
                                    candidates = response_data.get('candidates', [])
                                    if candidates and len(candidates) > 0:
                                        t_res = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                                        if t_res and t_res.strip():
                                            text_response = t_res.strip()
                                            break
                            except Exception as e:
                                print(f"Gemini API ({model}) failed: {e}")

                    # 2. Fallback to Pollinations AI Free Service if Gemini API is missing, invalid, or failed
                    if not text_response:
                        try:
                            formatted_messages = []
                            if raw_sys_inst:
                                formatted_messages.append({"role": "system", "content": str(raw_sys_inst)})
                            
                            for c in contents:
                                role = "user" if c.get("role") == "user" else "assistant"
                                parts = c.get("parts", [])
                                t_val = parts[0].get("text", "") if parts and isinstance(parts[0], dict) else ""
                                if t_val:
                                    formatted_messages.append({"role": role, "content": t_val})

                            pol_payload = {
                                "messages": formatted_messages,
                                "model": "openai"
                            }

                            req_pol = urllib.request.Request(
                                "https://text.pollinations.ai/v1/chat/completions",
                                data=json.dumps(pol_payload).encode('utf-8'),
                                headers={
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                                },
                                method='POST'
                            )
                            with urllib.request.urlopen(req_pol, timeout=15) as res_pol:
                                pol_json = json.loads(res_pol.read().decode('utf-8'))
                                choices = pol_json.get('choices', [])
                                if choices and len(choices) > 0:
                                    t_ans = choices[0].get('message', {}).get('content', '')
                                    if t_ans and t_ans.strip():
                                        text_response = t_ans.strip()
                        except Exception as pol_err:
                            print("Pollinations AI v1 chat completions failed:", pol_err)
                            # Secondary GET fallback to Pollinations AI
                            try:
                                last_user_msg = ""
                                for m in reversed(contents):
                                    if m.get("role") == "user":
                                        last_user_msg = m.get("parts", [{}])[0].get("text", "")
                                        break
                                if last_user_msg:
                                    encoded_prompt = urllib.parse.quote(last_user_msg)
                                    get_url = f"https://text.pollinations.ai/{encoded_prompt}?model=openai"
                                    req_get = urllib.request.Request(
                                        get_url,
                                        headers={'User-Agent': 'Mozilla/5.0'}
                                    )
                                    with urllib.request.urlopen(req_get, timeout=12) as res_get:
                                        get_text = res_get.read().decode('utf-8')
                                        if get_text and get_text.strip():
                                            text_response = get_text.strip()
                            except Exception as get_err:
                                print("Pollinations AI GET fallback failed:", get_err)

                    if text_response:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"text": text_response}).encode('utf-8'))
                        return
                    else:
                        self.send_response(500)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": "AI service busy or unreachable. Please try again."}).encode('utf-8'))
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
