# app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def create_app():
    app = Flask(__name__)
    # 간단한 설정: SQLite 파일을 instance/app.db 로
    app.config.update(
        SECRET_KEY="replace_with_secure_value",
        SQLALCHEMY_DATABASE_URI="sqlite:///instance/app.db",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )

    db.init_app(app)

    # 블루프린트 등록
    from helloSecurity.routes.restaurant import bp as restaurants_bp
    app.register_blueprint(restaurants_bp)

    return app