# restaurant.py

from flask import Blueprint, render_template, request, redirect, url_for
from helloSecurity import db
from helloSecurity.models import Restaurant, Tag, RestaurantTag, TagCategory
from sqlalchemy import func, distinct

from datetime import time

bp = Blueprint("restaurants", __name__, url_prefix="/") # 확장성 생각해 bp 사용함, 나중에 url 수정해주면 됨

# READ - 메인 목록 리스트
@bp.route("/")
def index():
    MIN_RATING = 4 # 별점 필터링 용 별점 (int)

    high_rated = (Restaurant.query
                    .filter(Restaurant.rating >= MIN_RATING)
                    .order_by(Restaurant.id.desc())
                    .all()) # 필터링이 적용된 db만 가져오기
    
    tag_ids     = request.args.getlist("tags", type=int) # 현재 선택된 태그 가져오기
    
    search_q = Restaurant.query

    if tag_ids: # 태그 선택되어 있으면
        search_q = (search_q.join(RestaurantTag)
               .filter(RestaurantTag.tag_id.in_(tag_ids))
               .group_by(Restaurant.id)
               .having(func.count(distinct(RestaurantTag.tag_id)) == len(tag_ids))
               )
        # join - 식당x태그 수 -> filter - 선택 태그 (tag_ids) 해당하는 것만 필터링 -> group_by(restaurant) - 식당 한 개당 한 묶음
        # having - 동일 태그 중복 카운트 막기 위해 (선택 태그 수 == 이 식당이 가진 태그 수) 일치 시에만 통과하도록

    restaurants = search_q.order_by(Restaurant.id.desc()).all() # 조건 해당하는거 전부 가져오기
    categories = TagCategory.query.order_by(TagCategory.id).all() # 미리 저장된 태그 db 가져오기

    return render_template("restaurants/main.html",
                           restaurants=restaurants,
                           categories=categories,
                           filtered=high_rated,
                           selected=set(tag_ids))

# READ – 단일 게시글 상세
@bp.route("/<int:r_id>")
def detail(r_id):
    r = Restaurant.query.get_or_404(r_id)
    return render_template("restaurants/detail.html", restaurant=r)


# CREATE - 기본 Create
@bp.route("/new", methods=["GET", "POST"]) # naver.com/restaurant/update
def create():
    if request.method == "POST":
        start_time = time.fromisoformat(request.form["start_hour"])
        end_time   = time.fromisoformat(request.form["end_hour"])

        r = Restaurant(
            name = request.form["name"],
            address=request.form["address"],
            description=request.form["description"],
            rating=int(request.form["rating"]),
            start_hour=start_time,
            end_hour=end_time,
            break_time=request.form["breaktime"]
        )

        db.session.add(r)     
        db.session.flush()

        tag_ids = map(int, request.form.getlist("tags"))
        db.session.add_all(
            [RestaurantTag(restaurant_id=r.id, tag_id=tid) for tid in tag_ids]
        )                      

        db.session.commit()
        return redirect(url_for("restaurants.index"))

    categories = TagCategory.query.order_by(TagCategory.id).all()
    return render_template("restaurants/create.html",
                           tags=[],               # ← 안 써도 되지만 호환용
                           categories=categories)

# UPDATE ─ 기본 Update
@bp.route("/<int:r_id>/edit", methods=["GET", "POST"])
def edit(r_id):
    r = Restaurant.query.get_or_404(r_id)

    if request.method == "POST":

        start_str = request.form["start_hour"]
        end_str   = request.form["end_hour"]

        start_time = time.fromisoformat(start_str)
        end_time   = time.fromisoformat(end_str)

        r.name = request.form["name"]
        r.address = request.form["address"]
        r.description = request.form["description"]
        r.rating = request.form['rating']
        r.start_hour = start_time
        r.end_hour = end_time
        r.break_time = request.form['breaktime']

        RestaurantTag.query.filter_by(restaurant_id=r.id).delete()
        for tag_id in request.form.getlist("tags"):
            db.session.add(RestaurantTag(
                restaurant_id=r.id,
                tag_id=int(tag_id)
            ))

        db.session.commit()
        return redirect(url_for("restaurants.index"))

    categories = TagCategory.query.order_by(TagCategory.id).all()
    attached = {rel.tag_id for rel in r.tags} # 수정 폼에 미리 체크되어있음
    return render_template("restaurants/create.html",
                           restaurant=r,
                           categories=categories,
                           attached=attached)

# DELETE ─ 기본 Delete
@bp.route("/<int:r_id>/delete", methods=["POST"])
def delete(r_id):
    r = Restaurant.query.get_or_404(r_id)
    db.session.delete(r)
    db.session.commit()
    return redirect(url_for("restaurants.index"))