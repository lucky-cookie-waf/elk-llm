from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os

db = SQLAlchemy()

def create_app():
    app = Flask(__name__, instance_relative_config=True)

    # instance 폴더가 없으면 만들기
    os.makedirs(app.instance_path, exist_ok=True)

    db_path = os.path.join(app.instance_path, "app.db")
    app.config.update(
        SECRET_KEY="replace_me",
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{db_path}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )

    db.init_app(app)

    from helloSecurity.routes.restaurant import bp as restaurants_bp
    app.register_blueprint(restaurants_bp)

    return app