export const PROPERTY_TYPES = [
  { value: "APARTMENT", label: "Apartment" },
  { value: "VILLA", label: "Villa" },
  { value: "HOUSE", label: "Independent House" },
  { value: "PENTHOUSE", label: "Penthouse" },
  { value: "STUDIO", label: "Studio" },
  { value: "PLOT", label: "Plot / Land" },
  { value: "COMMERCIAL", label: "Commercial" },
];

export const PROPERTY_STATUSES = ["DRAFT", "ACTIVE", "PENDING", "SOLD", "RENTED"];

export const AMENITIES = [
  "Swimming Pool",
  "Gym",
  "Clubhouse",
  "24x7 Security",
  "Power Backup",
  "Covered Parking",
  "Lift",
  "Garden",
  "Children's Play Area",
  "Home Automation",
  "Sea View",
  "Terrace",
  "Private Pool",
  "Concierge",
  "Co-working Lounge",
  "EV Charging",
  "Pet Friendly",
  "Vastu Compliant",
];

export const LEAD_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "VIEWING", label: "Viewing" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

export const LEAD_SOURCES = [
  { value: "ENQUIRY", label: "Property enquiry" },
  { value: "TOUR_BOOKING", label: "Tour booking" },
  { value: "CALLBACK", label: "Callback request" },
  { value: "CONTACT", label: "Contact form" },
];

export const STRATEGIES = [
  { value: "ROUND_ROBIN", label: "Round robin", hint: "Rotate fairly: the broker who waited longest goes next." },
  { value: "LEAST_LOADED", label: "Least loaded", hint: "Send to the broker with the fewest open leads." },
  { value: "WEIGHTED", label: "Weighted", hint: "Top performers (higher weight) receive proportionally more." },
  { value: "LISTING_AGENT", label: "Listing agent first", hint: "The property's own agent gets it if available." },
];

export const LANGUAGES = ["English", "Hindi", "Marathi", "Gujarati", "Kannada", "Tamil", "Telugu", "Bengali", "Punjabi", "Urdu", "Arabic", "French"];

export const FONT_CHOICES = [
  { value: "playfair", label: "Playfair Display (elegant serif)", kind: "heading" },
  { value: "cormorant", label: "Cormorant Garamond (luxury serif)", kind: "heading" },
  { value: "fraunces", label: "Fraunces (soft serif)", kind: "heading" },
  { value: "manrope", label: "Manrope (modern sans)", kind: "both" },
  { value: "poppins", label: "Poppins (friendly sans)", kind: "both" },
  { value: "inter", label: "Inter (neutral sans)", kind: "both" },
  { value: "dmsans", label: "DM Sans (clean sans)", kind: "both" },
];

export const CURRENCIES = [
  { code: "INR", label: "Indian Rupee", locale: "en-IN" },
  { code: "USD", label: "US Dollar", locale: "en-US" },
  { code: "GBP", label: "British Pound", locale: "en-GB" },
  { code: "AED", label: "UAE Dirham", locale: "en-AE" },
  { code: "EUR", label: "Euro", locale: "en-IE" },
  { code: "AUD", label: "Australian Dollar", locale: "en-AU" },
  { code: "CAD", label: "Canadian Dollar", locale: "en-CA" },
  { code: "SGD", label: "Singapore Dollar", locale: "en-SG" },
];

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const DEFAULT_WORKING_HOURS = {
  mon: ["09:00", "19:00"],
  tue: ["09:00", "19:00"],
  wed: ["09:00", "19:00"],
  thu: ["09:00", "19:00"],
  fri: ["09:00", "19:00"],
  sat: ["10:00", "17:00"],
  sun: null,
};

export const MAP_PRESETS = [
  { label: "Mumbai", lat: 19.076, lng: 72.8777, zoom: 11 },
  { label: "Bengaluru", lat: 12.9716, lng: 77.5946, zoom: 11 },
  { label: "Delhi NCR", lat: 28.6139, lng: 77.209, zoom: 10.5 },
  { label: "Dubai", lat: 25.2048, lng: 55.2708, zoom: 10.5 },
  { label: "London", lat: 51.5072, lng: -0.1276, zoom: 10.5 },
  { label: "New York", lat: 40.7128, lng: -74.006, zoom: 10.5 },
];
