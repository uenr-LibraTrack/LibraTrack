import http.server
import socketserver
import json
import os

PORT = 8081
DATA_FILE = 'database.json'
NOTIFS_FILE = 'notifications.json'

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
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    # Change directory to the folder containing this script so it serves the right files
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), CustomAPIHandler) as httpd:
        print(f"Server starting on port {PORT}...")
        print(f"API Endpoints available: /api/state, /api/notifications")
        print(f"Access it locally at: http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
