"""Demo content for the three seeded tenants. Prices are in the tenant's currency (INR)."""


CR = 1e7
L = 1e5

TENANTS = [
  {
    "slug": "skyline",
    "name": "Skyline Realty",
    "plan": "ENTERPRISE",
    "tagline": "Mumbai's most considered addresses",
    "about":
      "Skyline Realty is a Mumbai boutique brokerage specialising in sea-facing residences, heritage apartments and investment-grade commercial space. Every listing is personally verified by our advisors.",
    "primaryColor": "#0f3d3e",
    "accentColor": "#d4a64a",
    "fontHeading": "playfair",
    "fontBody": "inter",
    "heroImages": ["hero-01", "hero-04", "hero-03"],
    "contactEmail": "hello@skyline.demo",
    "contactPhone": "+91 22 4000 1200",
    "whatsapp": "+912240001200",
    "address": "Level 14, One Indiabulls, Lower Parel, Mumbai 400013",
    "mapLat": 19.07,
    "mapLng": 72.87,
    "mapZoom": 10.6,
    "analyticsSiteId": "skyline-demo",
    "owner": { "name": "Aditi Rao", "email": "owner@skyline.demo" },
  },
  {
    "slug": "heritage",
    "name": "Heritage Homes",
    "plan": "PRO",
    "tagline": "Gardens, grandeur and Bengaluru's best neighbourhoods",
    "about":
      "Heritage Homes has helped Bengaluru families find their forever home for over two decades. From leafy Jayanagar bungalows to Whitefield tech-corridor apartments, we know every street.",
    "primaryColor": "#8a3b12",
    "accentColor": "#0e7490",
    "fontHeading": "cormorant",
    "fontBody": "manrope",
    "heroImages": ["hero-02", "hero-03", "hero-04"],
    "contactEmail": "hello@heritage.demo",
    "contactPhone": "+91 80 4100 7788",
    "whatsapp": "+918041007788",
    "address": "12, 100 Feet Road, Indiranagar, Bengaluru 560038",
    "mapLat": 12.9716,
    "mapLng": 77.62,
    "mapZoom": 10.8,
    "analyticsSiteId": "heritage-demo",
    "owner": { "name": "Kiran Hegde", "email": "owner@heritage.demo" },
  },
  {
    "slug": "urbannest",
    "name": "Urban Nest",
    "plan": "STARTER",
    "tagline": "Gurugram rentals without the runaround",
    "about":
      "Urban Nest is a small, friendly Gurugram agency focused on quality rentals and first-home purchases.",
    "primaryColor": "#5b21b6",
    "accentColor": "#f97316",
    "fontHeading": "poppins",
    "fontBody": "poppins",
    "heroImages": ["hero-04", "hero-01"],
    "contactEmail": "hello@urbannest.demo",
    "contactPhone": "+91 124 400 5599",
    "whatsapp": "+911244005599",
    "address": "Sector 29, Gurugram 122001",
    "mapLat": 28.45,
    "mapLng": 77.05,
    "mapZoom": 11,
    "analyticsSiteId": "urbannest-demo",
    "owner": { "name": "Simran Bedi", "email": "owner@urbannest.demo" },
  },
]

FULL_WEEK = { "mon": ["09:00", "19:00"], "tue": ["09:00", "19:00"], "wed": ["09:00", "19:00"], "thu": ["09:00", "19:00"], "fri": ["09:00", "19:00"], "sat": ["10:00", "17:00"], "sun": None }
EVERY_DAY = { "mon": ["10:00", "20:00"], "tue": ["10:00", "20:00"], "wed": ["10:00", "20:00"], "thu": ["10:00", "20:00"], "fri": ["10:00", "20:00"], "sat": ["10:00", "20:00"], "sun": ["11:00", "18:00"] }
TUE_SUN = { "mon": None, "tue": ["11:00", "21:00"], "wed": ["11:00", "21:00"], "thu": ["11:00", "21:00"], "fri": ["11:00", "21:00"], "sat": ["11:00", "21:00"], "sun": ["11:00", "21:00"] }



def box(w, s, e, n):
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}



BROKERS = {
  "skyline": [
    { "key": "priya", "name": "Priya Sharma", "title": "Senior Luxury Advisor", "photo": "broker-01", "languages": ["English", "Hindi", "Marathi"], "specialties": ["Villas", "Sea-view", "Luxury"], "areas": ["Juhu", "Bandra West", "Khar West", "Santacruz West"], "territory": box(72.8, 19.04, 72.86, 19.14), "weight": 3, "capacity": 12, "hours": FULL_WEEK, "email": "priya@skyline.demo", "phone": "+91 98200 11001", "bio": "12 years placing Bandra-Juhu homes for founders, film families and NRIs." },
    { "key": "arjun", "name": "Arjun Mehta", "title": "Head of Prime South Mumbai", "photo": "broker-02", "languages": ["English", "Hindi", "Gujarati"], "specialties": ["Penthouses", "Heritage", "Luxury"], "areas": ["Worli", "Lower Parel", "Malabar Hill", "Colaba"], "territory": None, "weight": 3, "capacity": 12, "hours": FULL_WEEK, "email": "arjun@skyline.demo", "phone": "+91 98200 11002", "bio": "Specialist in South Mumbai trophy apartments and heritage residences." },
    { "key": "neha", "name": "Neha Kulkarni", "title": "Family Homes Specialist", "photo": "broker-03", "languages": ["English", "Marathi", "Hindi"], "specialties": ["Family homes", "Resale"], "areas": ["Powai", "Andheri East", "Thane West", "Goregaon East"], "territory": None, "weight": 2, "capacity": 15, "hours": FULL_WEEK, "email": "neha@skyline.demo", "phone": "+91 98200 11003", "bio": "Helps growing families find the right school-and-commute balance." },
    { "key": "rohan", "name": "Rohan D'Souza", "title": "Rentals & First Homes", "photo": "broker-04", "languages": ["English", "Hindi", "Konkani"], "specialties": ["Rentals", "First-time buyers"], "areas": ["Andheri West", "Versova", "Malad West", "Borivali East"], "territory": None, "weight": 1, "capacity": 20, "hours": EVERY_DAY, "email": "rohan@skyline.demo", "phone": "+91 98200 11004", "bio": "Fast, transparent rentals across the western suburbs, seven days a week." },
    { "key": "farhan", "name": "Farhan Qureshi", "title": "Commercial & Investment", "photo": "broker-05", "languages": ["English", "Hindi", "Urdu"], "specialties": ["Commercial", "Investment", "Plots"], "areas": ["BKC", "Dadar", "Chembur"], "territory": None, "weight": 2, "capacity": 10, "hours": FULL_WEEK, "email": "farhan@skyline.demo", "phone": "+91 98200 11005", "bio": "Grade-A offices, retail high-streets and land banks." },
    { "key": "ananya", "name": "Ananya Iyer", "title": "Navi Mumbai & Alibaug", "photo": "broker-06", "languages": ["English", "Tamil", "Hindi"], "specialties": ["Weekend homes", "Plots", "Villas"], "areas": ["Vashi", "Nerul", "Kharghar", "Alibaug"], "territory": None, "weight": 2, "capacity": 12, "hours": TUE_SUN, "email": "ananya@skyline.demo", "phone": "+91 98200 11006", "bio": "Navi Mumbai growth corridors and Alibaug weekend villas." },
  ],
  "heritage": [
    { "key": "kavya", "name": "Kavya Reddy", "title": "Principal Advisor", "photo": "broker-07", "languages": ["English", "Kannada", "Telugu"], "specialties": ["Villas", "Bungalows"], "areas": ["Indiranagar", "Jayanagar", "Sadashivanagar", "Malleshwaram"], "territory": None, "weight": 3, "capacity": 12, "hours": FULL_WEEK, "email": "kavya@heritage.demo", "phone": "+91 98450 22001", "bio": "Leafy-neighbourhood specialist with 15 years in central Bengaluru." },
    { "key": "vikram", "name": "Vikram Nair", "title": "Tech Corridor Specialist", "photo": "broker-08", "languages": ["English", "Hindi", "Kannada"], "specialties": ["Apartments", "Rentals"], "areas": ["Whitefield", "Bellandur", "Sarjapur Road", "Koramangala"], "territory": None, "weight": 2, "capacity": 18, "hours": EVERY_DAY, "email": "vikram@heritage.demo", "phone": "+91 98450 22002", "bio": "Apartments and rentals for the ORR and Whitefield tech crowd." },
    { "key": "meera", "name": "Meera Gowda", "title": "North Bengaluru Advisor", "photo": "broker-03", "languages": ["English", "Kannada", "Hindi"], "specialties": ["Plots", "Villas"], "areas": ["Hebbal", "Yelahanka", "HSR Layout", "JP Nagar"], "territory": None, "weight": 1, "capacity": 14, "hours": FULL_WEEK, "email": "meera@heritage.demo", "phone": "+91 98450 22003", "bio": "Plots, villas and emerging North Bengaluru." },
  ],
  "urbannest": [
    { "key": "simran", "name": "Simran Bedi", "title": "Founder & Lead Agent", "photo": "broker-01", "languages": ["English", "Hindi", "Punjabi"], "specialties": ["Rentals"], "areas": ["Golf Course Road", "DLF Phase 4"], "territory": None, "weight": 2, "capacity": 12, "hours": FULL_WEEK, "email": "simran@urbannest.demo", "phone": "+91 98100 33001", "bio": "Gurugram rentals made simple." },
    { "key": "aman", "name": "Aman Verma", "title": "Sales Associate", "photo": "broker-02", "languages": ["English", "Hindi"], "specialties": ["First homes"], "areas": ["Sohna Road", "Sector 56"], "territory": None, "weight": 1, "capacity": 12, "hours": EVERY_DAY, "email": "aman@urbannest.demo", "phone": "+91 98100 33002", "bio": "Guides first-time buyers from shortlist to keys." },
  ],
}

AMEN = {
  "luxury": ["Swimming Pool", "Gym", "Concierge", "24x7 Security", "Power Backup", "Covered Parking", "Home Automation", "Lift", "Terrace"],
  "family": ["Clubhouse", "Gym", "Children's Play Area", "Garden", "24x7 Security", "Power Backup", "Covered Parking", "Lift"],
  "city": ["Gym", "24x7 Security", "Lift", "Power Backup", "Covered Parking", "Co-working Lounge", "EV Charging"],
  "villa": ["Private Pool", "Garden", "Terrace", "24x7 Security", "Covered Parking", "Home Automation", "Power Backup", "Pet Friendly"],
  "commercial": ["24x7 Security", "Power Backup", "Lift", "Covered Parking", "EV Charging", "Concierge"],
  "plot": ["Garden", "24x7 Security"],
}

# [title, type, listingType, price, beds, baths, areaSqft, locality, city, lat, lng, amenityKit, extPhoto, featured, tourKey|None, listingBroker]
S = "SALE"
R = "RENT"
PROPERTIES = {
  "skyline": [
    ["Sea-Facing Villa on Juhu Tara Road", "VILLA", S, 28 * CR, 5, 6, 6200, "Juhu", "Mumbai", 19.1075, 72.8263, "villa", "ext-06", True, "villa", "priya"],
    ["Sky Penthouse, Worli Sea Face", "PENTHOUSE", S, 42 * CR, 4, 5, 5400, "Worli", "Mumbai", 19.009, 72.816, "luxury", "ext-10", True, "apartment", "arjun"],
    ["Heritage 3BHK, Malabar Hill", "APARTMENT", S, 18.5 * CR, 3, 4, 3100, "Malabar Hill", "Mumbai", 18.9548, 72.7985, "luxury", "ext-17", True, None, "arjun"],
    ["Art-Deco Apartment, Colaba", "APARTMENT", S, 9.8 * CR, 2, 2, 1450, "Colaba", "Mumbai", 18.9067, 72.8147, "city", "ext-15", False, None, "arjun"],
    ["Designer 3BHK, Pali Hill", "APARTMENT", S, 6.5 * CR, 3, 3, 1850, "Bandra West", "Mumbai", 19.068, 72.8296, "luxury", "ext-09", True, None, "priya"],
    ["Boutique Residence, Khar West", "APARTMENT", S, 7.2 * CR, 3, 3, 1700, "Khar West", "Mumbai", 19.072, 72.837, "luxury", "ext-12", False, None, "priya"],
    ["Garden Apartment, Santacruz West", "APARTMENT", S, 4.1 * CR, 2, 2, 1250, "Santacruz West", "Mumbai", 19.081, 72.836, "family", "ext-02", False, None, "priya"],
    ["High-Rise 2BHK, Lower Parel", "APARTMENT", S, 5.4 * CR, 2, 2, 1320, "Lower Parel", "Mumbai", 18.993, 72.83, "city", "ext-10", False, None, "arjun"],
    ["Corporate Studio, BKC", "STUDIO", S, 2.1 * CR, 1, 1, 620, "BKC", "Mumbai", 19.068, 72.869, "city", "com-01", False, None, "farhan"],
    ["Lakeview 3BHK, Powai", "APARTMENT", S, 3.1 * CR, 3, 3, 1480, "Powai", "Mumbai", 19.1176, 72.906, "family", "ext-03", True, "powai", "neha"],
    ["Hiranandani 2BHK, Powai", "APARTMENT", S, 2.35 * CR, 2, 2, 1050, "Powai", "Mumbai", 19.1197, 72.905, "family", "ext-08", False, None, "neha"],
    ["Metro-Side 2BHK, Andheri East", "APARTMENT", S, 1.65 * CR, 2, 2, 880, "Andheri East", "Mumbai", 19.1136, 72.8697, "city", "ext-17", False, None, "neha"],
    ["Lokhandwala Duplex, Andheri West", "APARTMENT", S, 3.9 * CR, 3, 3, 1900, "Andheri West", "Mumbai", 19.143, 72.828, "family", "ext-04", False, None, "rohan"],
    ["Beach-Lane Studio, Versova", "STUDIO", S, 1.2 * CR, 1, 1, 540, "Versova", "Mumbai", 19.131, 72.811, "city", "ext-13", False, None, "rohan"],
    ["Garden Estate 2BHK, Goregaon East", "APARTMENT", S, 1.85 * CR, 2, 2, 940, "Goregaon East", "Mumbai", 19.1663, 72.8526, "family", "ext-01", False, None, "neha"],
    ["Skyline 3BHK, Malad West", "APARTMENT", S, 2.2 * CR, 3, 3, 1250, "Malad West", "Mumbai", 19.186, 72.835, "family", "ext-15", False, None, "rohan"],
    ["Family 3BHK, Borivali East", "APARTMENT", S, 1.7 * CR, 3, 2, 1180, "Borivali East", "Mumbai", 19.2307, 72.8567, "family", "ext-08", False, None, "rohan"],
    ["Lakeside 3BHK, Ghodbunder Road", "APARTMENT", S, 1.45 * CR, 3, 3, 1320, "Thane West", "Thane", 19.25, 72.97, "family", "ext-03", False, None, "neha"],
    ["Compact 1BHK, Thane West", "APARTMENT", S, 78 * L, 1, 1, 520, "Thane West", "Thane", 19.2183, 72.9781, "city", "ext-17", False, None, "neha"],
    ["Sunlit 2BHK, Vashi", "APARTMENT", S, 1.05 * CR, 2, 2, 860, "Vashi", "Navi Mumbai", 19.0771, 72.9988, "family", "ext-12", False, None, "ananya"],
    ["Palm Beach Road 3BHK, Nerul", "APARTMENT", S, 1.95 * CR, 3, 3, 1380, "Nerul", "Navi Mumbai", 19.033, 73.0297, "family", "ext-02", False, None, "ananya"],
    ["Hilltop Villa, Kharghar", "VILLA", S, 3.4 * CR, 4, 4, 3200, "Kharghar", "Navi Mumbai", 19.0474, 73.0699, "villa", "ext-05", False, None, "ananya"],
    ["Nagaon Beach Villa, Alibaug", "VILLA", S, 6.8 * CR, 4, 5, 4200, "Alibaug", "Alibaug", 18.614, 72.87, "villa", "ext-07", True, "alibaug", "ananya"],
    ["Mango Orchard Plot, Alibaug", "PLOT", S, 1.4 * CR, 0, 0, 5400, "Alibaug", "Alibaug", 18.6414, 72.8722, "plot", "ext-18", False, None, "ananya"],
    ["Heritage Bungalow, Chembur", "HOUSE", S, 11 * CR, 4, 4, 3600, "Chembur", "Mumbai", 19.0522, 72.9005, "villa", "ext-11", False, None, "farhan"],
    ["Grade-A Office Floor, BKC", "COMMERCIAL", S, 24 * CR, 0, 4, 5200, "BKC", "Mumbai", 19.0685, 72.8695, "commercial", "com-02", False, None, "farhan"],
    ["High-Street Showroom, Dadar", "COMMERCIAL", S, 7.5 * CR, 0, 2, 1800, "Dadar", "Mumbai", 19.0178, 72.8478, "commercial", "com-01", False, None, "farhan"],
    ["Sea-View 2BHK for Rent, Bandra West", "APARTMENT", R, 2.4 * L, 2, 2, 1100, "Bandra West", "Mumbai", 19.0596, 72.8295, "luxury", "ext-09", True, None, "priya"],
    ["Furnished 3BHK for Rent, Juhu", "APARTMENT", R, 3.5 * L, 3, 3, 1700, "Juhu", "Mumbai", 19.1, 72.8265, "luxury", "ext-12", False, None, "priya"],
    ["Lake Studio for Rent, Powai", "STUDIO", R, 48000, 1, 1, 520, "Powai", "Mumbai", 19.1185, 72.9075, "city", "ext-17", False, None, "neha"],
    ["1BHK for Rent, Andheri West", "APARTMENT", R, 55000, 1, 1, 610, "Andheri West", "Mumbai", 19.1363, 72.8296, "city", "ext-15", False, None, "rohan"],
    ["Designer 2BHK for Rent, Lower Parel", "APARTMENT", R, 1.6 * L, 2, 2, 1250, "Lower Parel", "Mumbai", 18.995, 72.8285, "city", "ext-10", False, None, "arjun"],
    ["Luxury 4BHK for Rent, Worli", "APARTMENT", R, 5.5 * L, 4, 4, 3000, "Worli", "Mumbai", 19.0176, 72.8156, "luxury", "ext-06", True, None, "arjun"],
    ["2BHK for Rent, Thane West", "APARTMENT", R, 38000, 2, 2, 900, "Thane West", "Thane", 19.22, 72.975, "family", "ext-03", False, None, "neha"],
    ["3BHK for Rent, Navi Mumbai", "APARTMENT", R, 62000, 3, 3, 1350, "Nerul", "Navi Mumbai", 19.036, 73.02, "family", "ext-02", False, None, "ananya"],
    ["Plug-and-Play Office for Rent, BKC", "COMMERCIAL", R, 6.5 * L, 0, 3, 3500, "BKC", "Mumbai", 19.0675, 72.871, "commercial", "com-02", False, None, "farhan"],
    ["Heritage Studio for Rent, Colaba", "STUDIO", R, 85000, 1, 1, 480, "Colaba", "Mumbai", 18.9101, 72.8178, "city", "ext-15", False, None, "arjun"],
  ],
  "heritage": [
    ["Leafy Bungalow, Sadashivanagar", "HOUSE", S, 32 * CR, 5, 6, 6800, "Sadashivanagar", "Bengaluru", 13.007, 77.581, "villa", "ext-11", True, None, "kavya"],
    ["Courtyard Villa, Indiranagar", "VILLA", S, 12.5 * CR, 4, 5, 4200, "Indiranagar", "Bengaluru", 12.9784, 77.6408, "villa", "ext-05", True, "villa", "kavya"],
    ["Jayanagar Heritage Home", "HOUSE", S, 7.8 * CR, 4, 4, 3000, "Jayanagar", "Bengaluru", 12.925, 77.5938, "family", "ext-18", False, None, "kavya"],
    ["Koramangala Designer 3BHK", "APARTMENT", S, 3.6 * CR, 3, 3, 1700, "Koramangala", "Bengaluru", 12.9352, 77.6245, "luxury", "ext-12", True, None, "vikram"],
    ["Whitefield Skyview 3BHK", "APARTMENT", S, 2.1 * CR, 3, 3, 1550, "Whitefield", "Bengaluru", 12.9698, 77.75, "family", "ext-08", False, "apartment", "vikram"],
    ["HSR Layout Smart 2BHK", "APARTMENT", S, 1.55 * CR, 2, 2, 1100, "HSR Layout", "Bengaluru", 12.9116, 77.6389, "city", "ext-17", False, None, "meera"],
    ["Sarjapur Road Gated Villa", "VILLA", S, 4.9 * CR, 4, 4, 3400, "Sarjapur Road", "Bengaluru", 12.901, 77.687, "villa", "ext-07", False, None, "vikram"],
    ["Hebbal Lakeside Apartment", "APARTMENT", S, 1.95 * CR, 3, 3, 1450, "Hebbal", "Bengaluru", 13.0358, 77.597, "family", "ext-03", False, None, "meera"],
    ["Yelahanka Plot, 40x60", "PLOT", S, 1.1 * CR, 0, 0, 2400, "Yelahanka", "Bengaluru", 13.1007, 77.5963, "plot", "ext-18", False, None, "meera"],
    ["Bellandur ORR Studio", "STUDIO", R, 32000, 1, 1, 560, "Bellandur", "Bengaluru", 12.926, 77.6762, "city", "ext-17", False, None, "vikram"],
    ["JP Nagar Family 3BHK for Rent", "APARTMENT", R, 58000, 3, 3, 1500, "JP Nagar", "Bengaluru", 12.9063, 77.5857, "family", "ext-02", False, None, "meera"],
    ["Malleshwaram Garden Home for Rent", "HOUSE", R, 95000, 3, 3, 2200, "Malleshwaram", "Bengaluru", 13.0035, 77.5643, "family", "ext-11", False, None, "kavya"],
  ],
  "urbannest": [
    ["Golf Course Road 3BHK for Rent", "APARTMENT", R, 95000, 3, 3, 1900, "Golf Course Road", "Gurugram", 28.435, 77.102, "luxury", "ext-09", True, None, "simran"],
    ["DLF Phase 4 Studio for Rent", "STUDIO", R, 38000, 1, 1, 600, "DLF Phase 4", "Gurugram", 28.4595, 77.0958, "city", "ext-17", False, None, "simran"],
    ["Sector 56 2BHK", "APARTMENT", S, 1.75 * CR, 2, 2, 1250, "Sector 56", "Gurugram", 28.424, 77.1055, "family", "ext-08", False, None, "aman"],
    ["Sohna Road Family Home", "APARTMENT", S, 1.2 * CR, 3, 2, 1400, "Sohna Road", "Gurugram", 28.4089, 77.045, "family", "ext-03", False, None, "aman"],
    ["MG Road Office for Rent", "COMMERCIAL", R, 1.8 * L, 0, 2, 1500, "MG Road", "Gurugram", 28.48, 77.081, "commercial", "com-02", False, None, "simran"],
    ["Sushant Lok Villa", "VILLA", S, 6.2 * CR, 4, 5, 3800, "Sushant Lok", "Gurugram", 28.459, 77.07, "villa", "ext-06", True, None, "simran"],
  ],
}

AMENITY_KITS = AMEN

TOUR_SCENES = {
  "villa": {
    "plan": "villa",
    "title": "Walk through the villa",
    "scenes": [
      { "key": "living", "name": "Living room", "pano": "pano-living", "info": "Double-height living room with floor-to-ceiling glazing" },
      { "key": "lounge", "name": "Family lounge", "pano": "pano-lounge", "info": "Skylit lounge, perfect for evenings" },
      { "key": "study", "name": "Study", "pano": "pano-studio", "info": "Acoustic-treated home office" },
      { "key": "bedroom", "name": "Master bedroom", "pano": "pano-room", "info": "Walk-in wardrobe and private balcony" },
      { "key": "terrace", "name": "Terrace", "pano": "pano-terrace", "info": "Private terrace with sunset views" },
    ],
  },
  "apartment": {
    "plan": "apartment",
    "title": "Step inside",
    "scenes": [
      { "key": "lobby", "name": "Entrance lobby", "pano": "pano-lobby", "info": "Private lift lobby with concierge" },
      { "key": "living", "name": "Living & dining", "pano": "pano-living", "info": "Imported Italian marble flooring" },
      { "key": "kitchen", "name": "Open kitchen", "pano": "pano-lounge", "info": "Modular kitchen with premium appliances" },
      { "key": "bedroom", "name": "Master bedroom", "pano": "pano-room", "info": "Blackout curtains and a dressing area" },
    ],
  },
  "powai": {
    "plan": "apartment",
    "title": "Lakeview apartment tour",
    "scenes": [
      { "key": "lobby", "name": "Entrance lobby", "pano": "pano-lobby", "info": "Secure entrance with video doorbell" },
      { "key": "living", "name": "Living & dining", "pano": "pano-studio", "info": "Lake-facing balcony from the living room" },
      { "key": "kitchen", "name": "Open kitchen", "pano": "pano-lounge", "info": "Breakfast counter with 4 seats" },
      { "key": "bedroom", "name": "Master bedroom", "pano": "pano-room", "info": "East-facing, morning light" },
    ],
  },
  "alibaug": {
    "external": "https://my.matterport.com/show/?m=SxQL3iGyoDo",
    "title": "3D walkthrough (Matterport)",
  },
}

LEAD_NAMES = [
  "Aarav Kapoor", "Ishita Malhotra", "Rahul Bansal", "Sneha Patil", "Vivek Joshi", "Ritu Agarwal", "Karan Singhania", "Pooja Desai",
  "Manish Tiwari", "Nandini Bhatt", "Sanjay Rao", "Tanya Fernandes", "Gaurav Saxena", "Divya Menon", "Harsh Vora", "Kritika Shah",
  "Siddharth Jain", "Meghna Das", "Anil Chawla", "Shreya Kulkarni", "Imran Sheikh", "Lavanya Krishnan", "Yash Thakkar", "Bhavna Mistry",
  "Rohit Narang", "Alisha Khan", "Dev Parekh", "Swati Pillai", "Nikhil Rane", "Aditi Bhargava", "Zoya Merchant", "Pranav Deshmukh",
  "Tara Williams", "Omar Farooqui", "Jaya Venkatesh", "Rajiv Oberoi", "Mitali Ghosh", "Arnav Khanna", "Ira Sethi", "Kabir Anand",
]

LEAD_MESSAGES = [
  "Hi, I would like to schedule a viewing this weekend. Is the price negotiable?",
  "Please share the floor plan and the latest availability.",
  "Interested in this property. Can you share the maintenance and possession details?",
  "We are relocating next month. Is the property available for immediate move-in?",
  "Could we book a video walkthrough? I am currently abroad.",
  "Looking for a similar property in the same locality. Please call me.",
  "What is the carpet area and are two parking slots included?",
  "Sharing my budget with you. Please suggest options near good schools.",
]
