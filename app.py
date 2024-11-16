from flask import Flask, request, send_file, render_template, abort, send_from_directory
from werkzeug.utils import secure_filename
from functools import wraps
import os
from werkzeug.security import check_password_hash, generate_password_hash
import secrets

app = Flask(__name__)

# Configuration
app.config.update(
    UPLOAD_FOLDER='uploads',
    MAX_CONTENT_LENGTH=16 * 1024 * 1024,  # 16MB max file size
    SECRET_KEY=os.getenv('SECRET_KEY', secrets.token_hex(16))
)

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Simple authentication
USERS = {
    "admin": generate_password_hash(os.getenv('ADMIN_PASSWORD', 'change_me_in_production'))
}

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)
    return decorated

def check_auth(username, password):
    return username in USERS and check_password_hash(USERS.get(username), password)

def authenticate():
    return ('Could not verify your access level for that URL.\n'
            'You have to login with proper credentials', 401,
            {'WWW-Authenticate': 'Basic realm="Login Required"'})

# Routes
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)