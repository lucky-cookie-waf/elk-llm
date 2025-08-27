# add_dummy.py

import random
from datetime import datetime, time
from helloSecurity import create_app, db
from helloSecurity.models.models import Restaurant, Tag, RestaurantTag

# 샘플 태그 / 설명 목록
sample_tags = [
    "카페", "한식", "중식", "일식", "양식", "디저트", "브런치",
    "혼밥", "단체석", "카공하기 좋은"
]

# 시간 생성기
def random_time(start=8, end=22):
    hour = random.randint(start, end)
    minute = random.choice([0, 30])
    return time(hour, minute)

# 태그 존재 시 재사용 / 없으면 생성
def get_or_create_tag(tag_name):
    tag = Tag.query.filter_by(name=tag_name).first()
    if not tag:
        tag = Tag(name=tag_name, category_id=1)  # category_id는 임의로 1 고정 (수정 가능)
        db.session.add(tag)
        db.session.flush()
    return tag

def generate_and_insert_restaurants(names):
    for name in names:
        address = f"서울특별시 서대문구 대현동 {random.randint(1, 100)}-{random.randint(1, 50)}"
        rating = random.randint(3, 5)
        start_hour = random_time(8, 11)
        end_hour = random_time(20, 23)
        break_start = random_time(13, 15)
        break_end = random_time(14, 16)
        break_time = f"{break_start.strftime('%H:%M')}~{break_end.strftime('%H:%M')}"
        tag_names = random.sample(sample_tags, k=random.randint(2, 4))

        # Restaurant 생성
        restaurant = Restaurant(
            name=name,
            address=address,
            rating=rating,
            start_hour=start_hour,
            end_hour=end_hour,
            break_time=break_time
        )
        db.session.add(restaurant)
        db.session.flush()

        # 태그 연결
        for tag_name in tag_names:
            tag = get_or_create_tag(tag_name)
            db.session.add(RestaurantTag(restaurant_id=restaurant.id, tag_id=tag.id))

    db.session.commit()
    print(" 더미 음식점 데이터 삽입 완료")

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        # 여기에 음식점 이름 목록을 입력
        names = [
            "소코아 신촌점", "신미불닭발 신촌점", "호시타코야끼 연세대점", "라헬의부엌 홍대점", "진돈부리",
            "마포만두", "더벤티 이대역점", "정돈가츠", "이대앞포차", "이디야커피 이화여대점"
        ]
        generate_and_insert_restaurants(names)