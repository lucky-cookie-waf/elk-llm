from flask import Blueprint, request, jsonify

bp = Blueprint("dummy", __name__)


# 데이터셋의 모든 요청을 받아주는 더미 엔드포인트
@bp.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE"])
def catch_all(path):
    return jsonify({"status": "ok", "path": path, "method": request.method}), 200
