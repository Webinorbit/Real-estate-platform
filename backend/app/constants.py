PROPERTY_TYPES = ["APARTMENT", "VILLA", "HOUSE", "PENTHOUSE", "STUDIO", "PLOT", "COMMERCIAL"]
PROPERTY_TYPE_LABELS = {
    "APARTMENT": "Apartment", "VILLA": "Villa", "HOUSE": "Independent House", "PENTHOUSE": "Penthouse",
    "STUDIO": "Studio", "PLOT": "Plot / Land", "COMMERCIAL": "Commercial",
}
PROPERTY_STATUSES = ["DRAFT", "ACTIVE", "PENDING", "SOLD", "RENTED"]
LEAD_STATUSES = ["NEW", "CONTACTED", "VIEWING", "NEGOTIATION", "WON", "LOST"]
OPEN_STATUSES = ["NEW", "CONTACTED", "VIEWING", "NEGOTIATION"]
LEAD_SOURCES = ["ENQUIRY", "TOUR_BOOKING", "CALLBACK", "CONTACT"]
STRATEGIES = ["ROUND_ROBIN", "LEAST_LOADED", "WEIGHTED", "LISTING_AGENT"]
PLANS = ["STARTER", "PRO", "ENTERPRISE"]

AMENITIES = [
    "Swimming Pool", "Gym", "Clubhouse", "24x7 Security", "Power Backup", "Covered Parking", "Lift", "Garden",
    "Children's Play Area", "Home Automation", "Sea View", "Terrace", "Private Pool", "Concierge",
    "Co-working Lounge", "EV Charging", "Pet Friendly", "Vastu Compliant",
]

LANGUAGES = ["English", "Hindi", "Marathi", "Gujarati", "Kannada", "Tamil", "Telugu", "Bengali", "Punjabi", "Urdu", "Arabic", "French"]

FONT_CHOICES = ["playfair", "cormorant", "fraunces", "manrope", "poppins", "inter", "dmsans"]

CURRENCIES = {
    "INR": "en-IN", "USD": "en-US", "GBP": "en-GB", "AED": "en-AE", "EUR": "en-IE", "AUD": "en-AU", "CAD": "en-CA", "SGD": "en-SG",
}

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

MAP_PRESETS = [
    {"label": "Mumbai", "lat": 19.076, "lng": 72.8777, "zoom": 11},
    {"label": "Bengaluru", "lat": 12.9716, "lng": 77.5946, "zoom": 11},
    {"label": "Delhi NCR", "lat": 28.6139, "lng": 77.209, "zoom": 10.5},
    {"label": "Dubai", "lat": 25.2048, "lng": 55.2708, "zoom": 10.5},
    {"label": "London", "lat": 51.5072, "lng": -0.1276, "zoom": 10.5},
    {"label": "New York", "lat": 40.7128, "lng": -74.006, "zoom": 10.5},
]
