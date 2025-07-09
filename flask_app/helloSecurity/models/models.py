from helloSecurity import db

class Restaurant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.String(200))
    description = db.Column(db.Text)
    rating = db.Column(db.Integer)
    start_hour = db.Column(db.Time)
    end_hour = db.Column(db.Time)
    break_time = db.Column(db.String(30))

    tags = db.relationship("RestaurantTag",
                       backref="restaurant",
                       cascade="all, delete-orphan")

class Tag(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)

    category_id = db.Column(db.Integer,
                            db.ForeignKey("tag_categories.id"),
                            nullable=False)

class TagCategory(db.Model):
    __tablename__ = "tag_categories"
    id   = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)

    # TagCategory.tags 로 역참조
    tags = db.relationship("Tag",
                            backref="category",
                            cascade="all, delete-orphan")

class RestaurantTag(db.Model):
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurant.id'), primary_key=True)
    tag_id = db.Column(db.Integer, db.ForeignKey('tag.id'), primary_key=True)

    tag = db.relationship("Tag", backref="restaurant_links")