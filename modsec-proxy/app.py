from flask import Flask, request, jsonify

application = Flask(__name__)

@application.route('/')
def home():
    return "Hello from ModSecurity protected Flask App!"

@application.route('/attack')
def attack():
    param = request.args.get('param', 'No parameter provided')
    return f"You requested with parameter: {param}"

@application.route('/test')
def test():
    return "This is a test endpoint."

if __name__ == '__main__':
    # Apache/WSGI가 Flask 앱을 관리하므로 이 부분은 직접 실행되지 않습니다.
    print("Flask app is running via Apache/WSGI.")