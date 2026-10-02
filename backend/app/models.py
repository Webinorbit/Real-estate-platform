"""SQLAlchemy models.

Attribute names deliberately equal the database column names (camelCase). That keeps the JSON the API returns
identical to what the front end was built against, with no renaming layer to get wrong.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.ids import new_id


def utcnow() -> datetime:
    """Naive UTC, matching the TIMESTAMP(3) WITHOUT TIME ZONE columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class TenantOwned:
    """Marker mixin. Sessions bound to a tenant can only see and write rows of that tenant (see app.db)."""


def pg_enum(name: str, *values: str):
    return Enum(*values, name=name, create_type=False)


PlanEnum = pg_enum("Plan", "STARTER", "PRO", "ENTERPRISE")
RoleEnum = pg_enum("Role", "SUPER", "OWNER", "ADMIN", "BROKER")
ListingTypeEnum = pg_enum("ListingType", "SALE", "RENT")
PropertyTypeEnum = pg_enum("PropertyType", "APARTMENT", "VILLA", "HOUSE", "PENTHOUSE", "PLOT", "COMMERCIAL", "STUDIO")
PropertyStatusEnum = pg_enum("PropertyStatus", "DRAFT", "ACTIVE", "PENDING", "SOLD", "RENTED")
TourKindEnum = pg_enum("TourKind", "PANORAMA", "EXTERNAL")
HotspotTypeEnum = pg_enum("HotspotType", "LINK", "INFO")
LeadSourceEnum = pg_enum("LeadSource", "ENQUIRY", "TOUR_BOOKING", "CALLBACK", "CONTACT")
LeadStatusEnum = pg_enum("LeadStatus", "NEW", "CONTACTED", "VIEWING", "NEGOTIATION", "WON", "LOST")
RoutingStrategyEnum = pg_enum("RoutingStrategy", "ROUND_ROBIN", "LEAST_LOADED", "WEIGHTED", "LISTING_AGENT")
AssignmentKindEnum = pg_enum("AssignmentKind", "INITIAL", "REASSIGN", "ESCALATE", "MANUAL")


def pk():
    return mapped_column(String, primary_key=True, default=new_id)


def created():
    return mapped_column(DateTime(3), default=utcnow)


def updated():
    return mapped_column(DateTime(3), default=utcnow, onupdate=utcnow)


class Tenant(Base):
    __tablename__ = "Tenant"

    id: Mapped[str] = pk()
    slug: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)
    customDomain: Mapped[str | None] = mapped_column(String, unique=True)
    plan: Mapped[str] = mapped_column(PlanEnum, default="STARTER")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    tagline: Mapped[str | None] = mapped_column(String)
    about: Mapped[str | None] = mapped_column(String)
    logoUrl: Mapped[str | None] = mapped_column(String)
    heroImageUrl: Mapped[str | None] = mapped_column(String)
    heroVideoUrl: Mapped[str | None] = mapped_column(String)
    primaryColor: Mapped[str] = mapped_column(String, default="#0f766e")
    accentColor: Mapped[str] = mapped_column(String, default="#f59e0b")
    fontHeading: Mapped[str] = mapped_column(String, default="playfair")
    fontBody: Mapped[str] = mapped_column(String, default="inter")
    currency: Mapped[str] = mapped_column(String, default="INR")
    locale: Mapped[str] = mapped_column(String, default="en-IN")
    areaUnit: Mapped[str] = mapped_column(String, default="sq ft")
    contactEmail: Mapped[str | None] = mapped_column(String)
    contactPhone: Mapped[str | None] = mapped_column(String)
    whatsapp: Mapped[str | None] = mapped_column(String)
    address: Mapped[str | None] = mapped_column(String)
    socials = mapped_column(JSONB, nullable=True)
    mapLat: Mapped[float] = mapped_column(Float, default=19.076)
    mapLng: Mapped[float] = mapped_column(Float, default=72.8777)
    mapZoom: Mapped[float] = mapped_column(Float, default=11)
    analyticsSiteId: Mapped[str | None] = mapped_column(String)
    webhookUrl: Mapped[str | None] = mapped_column(String)
    slaMinutes: Mapped[int] = mapped_column(Integer, default=15)
    maxReassigns: Mapped[int] = mapped_column(Integer, default=2)
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()


class User(Base):
    __tablename__ = "User"
    __table_args__ = (UniqueConstraint("tenantId", "email"),)

    id: Mapped[str] = pk()
    tenantId: Mapped[str | None] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(String)
    passwordHash: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(RoleEnum, default="ADMIN")
    createdAt: Mapped[datetime] = created()

    broker: Mapped["Broker | None"] = relationship(back_populates="user", uselist=False)


class Broker(TenantOwned, Base):
    __tablename__ = "Broker"
    __table_args__ = (Index("Broker_tenantId_active_idx", "tenantId", "active"),)

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    userId: Mapped[str | None] = mapped_column(ForeignKey("User.id", ondelete="SET NULL"), unique=True)
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    photoUrl: Mapped[str | None] = mapped_column(String)
    title: Mapped[str | None] = mapped_column(String)
    bio: Mapped[str | None] = mapped_column(String)
    languages = mapped_column(ARRAY(Text), default=list)
    specialties = mapped_column(ARRAY(Text), default=list)
    areas = mapped_column(ARRAY(Text), default=list)
    territory = mapped_column(JSONB, nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=15)
    weight: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    timezone: Mapped[str] = mapped_column(String, default="Asia/Kolkata")
    workingHours = mapped_column(JSONB, nullable=True)
    lastAssignedAt: Mapped[datetime | None] = mapped_column(DateTime(3))
    createdAt: Mapped[datetime] = created()

    user: Mapped["User | None"] = relationship(back_populates="broker")


class Property(TenantOwned, Base):
    __tablename__ = "Property"
    __table_args__ = (
        UniqueConstraint("tenantId", "slug"),
        Index("Property_tenantId_status_lat_lng_idx", "tenantId", "status", "lat", "lng"),
        Index("Property_tenantId_status_listingType_price_idx", "tenantId", "status", "listingType", "price"),
        Index("Property_tenantId_featured_idx", "tenantId", "featured"),
    )

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    slug: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    listingType: Mapped[str] = mapped_column(ListingTypeEnum, default="SALE")
    type: Mapped[str] = mapped_column(PropertyTypeEnum, default="APARTMENT")
    status: Mapped[str] = mapped_column(PropertyStatusEnum, default="ACTIVE")
    price: Mapped[float] = mapped_column(Float)
    priceUnit: Mapped[str | None] = mapped_column(String)
    beds: Mapped[int] = mapped_column(Integer, default=0)
    baths: Mapped[int] = mapped_column(Integer, default=0)
    areaSqft: Mapped[float] = mapped_column(Float, default=0)
    yearBuilt: Mapped[int | None] = mapped_column(Integer)
    furnishing: Mapped[str | None] = mapped_column(String)
    parking: Mapped[int] = mapped_column(Integer, default=0)
    floor: Mapped[int | None] = mapped_column(Integer)
    totalFloors: Mapped[int | None] = mapped_column(Integer)
    facing: Mapped[str | None] = mapped_column(String)
    address: Mapped[str] = mapped_column(String, default="")
    locality: Mapped[str] = mapped_column(String, default="")
    city: Mapped[str] = mapped_column(String, default="")
    state: Mapped[str | None] = mapped_column(String)
    postalCode: Mapped[str | None] = mapped_column(String)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    amenities = mapped_column(ARRAY(Text), default=list)
    images = mapped_column(JSONB, default=list)
    videoUrl: Mapped[str | None] = mapped_column(String)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    views: Mapped[int] = mapped_column(Integer, default=0)
    listingBrokerId: Mapped[str | None] = mapped_column(ForeignKey("Broker.id", ondelete="SET NULL"))
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    listingBroker: Mapped["Broker | None"] = relationship()
    tours: Mapped[list["Tour"]] = relationship(back_populates="property", cascade="all, delete-orphan", passive_deletes=True)


class Tour(TenantOwned, Base):
    __tablename__ = "Tour"
    __table_args__ = (Index("Tour_tenantId_propertyId_idx", "tenantId", "propertyId"),)

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    propertyId: Mapped[str] = mapped_column(ForeignKey("Property.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(TourKindEnum, default="PANORAMA")
    externalUrl: Mapped[str | None] = mapped_column(String)
    floorPlanUrl: Mapped[str | None] = mapped_column(String)
    planFloors = mapped_column(JSONB, nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    autoRotate: Mapped[bool] = mapped_column(Boolean, default=True)
    startSceneId: Mapped[str | None] = mapped_column(String)
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    property: Mapped["Property"] = relationship(back_populates="tours")
    scenes: Mapped[list["Scene"]] = relationship(back_populates="tour", order_by="Scene.order", cascade="all, delete-orphan", passive_deletes=True)


class Scene(TenantOwned, Base):
    __tablename__ = "Scene"
    __table_args__ = (Index("Scene_tourId_order_idx", "tourId", "order"),)

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    tourId: Mapped[str] = mapped_column(ForeignKey("Tour.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String)
    roomLabel: Mapped[str | None] = mapped_column(String)
    floor: Mapped[int] = mapped_column(Integer, default=0)
    panoramaUrl: Mapped[str] = mapped_column(String)
    thumbUrl: Mapped[str | None] = mapped_column(String)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    planX: Mapped[float | None] = mapped_column(Float)
    planY: Mapped[float | None] = mapped_column(Float)
    northYaw: Mapped[float] = mapped_column(Float, default=0)
    initialYaw: Mapped[float] = mapped_column(Float, default=0)
    order: Mapped[int] = mapped_column(Integer, default=0)

    tour: Mapped["Tour"] = relationship(back_populates="scenes")
    hotspots: Mapped[list["Hotspot"]] = relationship(
        back_populates="scene", foreign_keys="Hotspot.sceneId", cascade="all, delete-orphan", passive_deletes=True
    )


class Hotspot(TenantOwned, Base):
    __tablename__ = "Hotspot"
    __table_args__ = (Index("Hotspot_sceneId_idx", "sceneId"),)

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    sceneId: Mapped[str] = mapped_column(ForeignKey("Scene.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(HotspotTypeEnum, default="LINK")
    yaw: Mapped[float] = mapped_column(Float)
    pitch: Mapped[float] = mapped_column(Float, default=0)
    label: Mapped[str | None] = mapped_column(String)
    content: Mapped[str | None] = mapped_column(String)
    targetSceneId: Mapped[str | None] = mapped_column(ForeignKey("Scene.id", ondelete="SET NULL"))

    scene: Mapped["Scene"] = relationship(back_populates="hotspots", foreign_keys=[sceneId])


class Lead(TenantOwned, Base):
    __tablename__ = "Lead"
    __table_args__ = (
        Index("Lead_tenantId_status_idx", "tenantId", "status"),
        Index("Lead_tenantId_brokerId_status_idx", "tenantId", "brokerId", "status"),
        Index("Lead_status_slaDueAt_idx", "status", "slaDueAt"),
    )

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    propertyId: Mapped[str | None] = mapped_column(ForeignKey("Property.id", ondelete="SET NULL"))
    brokerId: Mapped[str | None] = mapped_column(ForeignKey("Broker.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(LeadSourceEnum, default="ENQUIRY")
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    message: Mapped[str | None] = mapped_column(String)
    language: Mapped[str | None] = mapped_column(String)
    budget: Mapped[float | None] = mapped_column(Float)
    preferredAt: Mapped[datetime | None] = mapped_column(DateTime(3))
    status: Mapped[str] = mapped_column(LeadStatusEnum, default="NEW")
    assignedAt: Mapped[datetime | None] = mapped_column(DateTime(3))
    firstResponseAt: Mapped[datetime | None] = mapped_column(DateTime(3))
    slaDueAt: Mapped[datetime | None] = mapped_column(DateTime(3))
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    reassignCount: Mapped[int] = mapped_column(Integer, default=0)
    lostReason: Mapped[str | None] = mapped_column(String)
    createdAt: Mapped[datetime] = created()
    updatedAt: Mapped[datetime] = updated()

    property: Mapped["Property | None"] = relationship()
    broker: Mapped["Broker | None"] = relationship()
    activities: Mapped[list["LeadActivity"]] = relationship(back_populates="lead", order_by="LeadActivity.createdAt.desc()", cascade="all, delete-orphan", passive_deletes=True)
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="lead", order_by="Assignment.createdAt.desc()", cascade="all, delete-orphan", passive_deletes=True)


class LeadActivity(TenantOwned, Base):
    __tablename__ = "LeadActivity"
    __table_args__ = (Index("LeadActivity_leadId_createdAt_idx", "leadId", "createdAt"),)

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    leadId: Mapped[str] = mapped_column(ForeignKey("Lead.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String)
    note: Mapped[str | None] = mapped_column(String)
    actor: Mapped[str | None] = mapped_column(String)
    createdAt: Mapped[datetime] = created()

    lead: Mapped["Lead"] = relationship(back_populates="activities")


class Assignment(TenantOwned, Base):
    __tablename__ = "Assignment"
    __table_args__ = (Index("Assignment_tenantId_createdAt_idx", "tenantId", "createdAt"), Index("Assignment_leadId_idx", "leadId"))

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    leadId: Mapped[str] = mapped_column(ForeignKey("Lead.id", ondelete="CASCADE"))
    brokerId: Mapped[str | None] = mapped_column(ForeignKey("Broker.id", ondelete="SET NULL"))
    ruleId: Mapped[str | None] = mapped_column(String)
    ruleName: Mapped[str | None] = mapped_column(String)
    strategy: Mapped[str | None] = mapped_column(String)
    kind: Mapped[str] = mapped_column(AssignmentKindEnum, default="INITIAL")
    reasons = mapped_column(JSONB, nullable=True)
    candidates = mapped_column(JSONB, nullable=True)
    createdAt: Mapped[datetime] = created()

    lead: Mapped["Lead"] = relationship(back_populates="assignments")
    broker: Mapped["Broker | None"] = relationship()


class RoutingRule(TenantOwned, Base):
    __tablename__ = "RoutingRule"
    __table_args__ = (Index("RoutingRule_tenantId_priority_idx", "tenantId", "priority"),)

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    conditions = mapped_column(JSONB, default=dict)
    strategy: Mapped[str] = mapped_column(RoutingStrategyEnum, default="ROUND_ROBIN")
    brokerIds = mapped_column(ARRAY(Text), default=list)
    requireAvailable: Mapped[bool] = mapped_column(Boolean, default=True)
    matchLanguage: Mapped[bool] = mapped_column(Boolean, default=False)
    useTerritory: Mapped[bool] = mapped_column(Boolean, default=False)
    slaMinutes: Mapped[int | None] = mapped_column(Integer)
    createdAt: Mapped[datetime] = created()


class SavedSearch(TenantOwned, Base):
    __tablename__ = "SavedSearch"
    __table_args__ = (Index("SavedSearch_tenantId_visitorId_idx", "tenantId", "visitorId"),)

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    visitorId: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    query = mapped_column(JSONB)
    createdAt: Mapped[datetime] = created()


class Favorite(TenantOwned, Base):
    __tablename__ = "Favorite"
    __table_args__ = (
        UniqueConstraint("tenantId", "visitorId", "propertyId"),
        Index("Favorite_tenantId_visitorId_idx", "tenantId", "visitorId"),
    )

    id: Mapped[str] = pk()
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id", ondelete="CASCADE"))
    visitorId: Mapped[str] = mapped_column(String)
    propertyId: Mapped[str] = mapped_column(ForeignKey("Property.id", ondelete="CASCADE"))
    createdAt: Mapped[datetime] = created()
