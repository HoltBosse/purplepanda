// The schema.org types a content type can describe its items as, and the properties of each that
// are worth mapping a field to. Drives the two selects in the structured-data section of the
// content type builder (components/ContentTypeManager.tsx), so this catalog is what an author can
// pick from — schema.org itself has hundreds of types, and this is the slice a CMS publishes.
// Adding one is a single entry here; nothing else needs to know about it, and the stored shape
// (jsonLdConfigSchema in ./content-types.ts) accepts any type and property name.

export type JsonLdTypeSuggestion = {
  type: string;
  properties: string[];
};

// Properties nearly every type carries, offered after each type's own so the specific ones come
// first in the select.
const UNIVERSAL_PROPERTIES = ["name", "description", "image", "url"];

const ARTICLE_PROPERTIES = [
  "headline",
  "alternativeHeadline",
  "articleBody",
  "articleSection",
  "author",
  "datePublished",
  "dateModified",
  "keywords",
  "wordCount",
  "inLanguage",
];

const CREATIVE_WORK_PROPERTIES = ["author", "datePublished", "dateModified", "keywords", "inLanguage"];

const PLACE_PROPERTIES = ["address", "telephone", "email", "geo", "openingHours", "priceRange"];

export const JSON_LD_TYPE_SUGGESTIONS: JsonLdTypeSuggestion[] = [
  { type: "Article", properties: ARTICLE_PROPERTIES },
  { type: "BlogPosting", properties: ARTICLE_PROPERTIES },
  { type: "NewsArticle", properties: [...ARTICLE_PROPERTIES, "dateline", "printSection"] },
  { type: "TechArticle", properties: [...ARTICLE_PROPERTIES, "dependencies", "proficiencyLevel"] },
  { type: "Report", properties: [...ARTICLE_PROPERTIES, "reportNumber"] },
  { type: "Book", properties: [...CREATIVE_WORK_PROPERTIES, "isbn", "bookEdition", "numberOfPages", "publisher"] },
  { type: "Course", properties: [...CREATIVE_WORK_PROPERTIES, "provider", "courseCode", "educationalLevel"] },
  { type: "Event", properties: ["startDate", "endDate", "location", "performer", "organizer", "eventStatus", "eventAttendanceMode", "offers"] },
  { type: "FAQPage", properties: ["mainEntity", "datePublished", "dateModified"] },
  { type: "QAPage", properties: ["mainEntity", "datePublished", "dateModified"] },
  { type: "HowTo", properties: [...CREATIVE_WORK_PROPERTIES, "step", "tool", "supply", "totalTime", "estimatedCost"] },
  { type: "JobPosting", properties: ["title", "datePosted", "validThrough", "employmentType", "hiringOrganization", "jobLocation", "baseSalary", "industry"] },
  { type: "LocalBusiness", properties: PLACE_PROPERTIES },
  { type: "Restaurant", properties: [...PLACE_PROPERTIES, "servesCuisine", "menu", "acceptsReservations"] },
  { type: "Store", properties: [...PLACE_PROPERTIES, "currenciesAccepted", "paymentAccepted"] },
  { type: "Place", properties: ["address", "telephone", "geo", "maximumAttendeeCapacity"] },
  { type: "Organization", properties: ["legalName", "logo", "email", "telephone", "address", "foundingDate", "sameAs"] },
  { type: "Person", properties: ["givenName", "familyName", "jobTitle", "email", "telephone", "worksFor", "sameAs", "birthDate"] },
  { type: "Product", properties: ["sku", "mpn", "gtin", "brand", "category", "color", "material", "offers", "aggregateRating", "review"] },
  { type: "Offer", properties: ["price", "priceCurrency", "availability", "validFrom", "priceValidUntil", "itemOffered"] },
  { type: "Recipe", properties: ["recipeIngredient", "recipeInstructions", "recipeYield", "recipeCategory", "recipeCuisine", "cookTime", "prepTime", "totalTime", "nutrition"] },
  { type: "Review", properties: ["reviewBody", "reviewRating", "itemReviewed", "author", "datePublished"] },
  { type: "Service", properties: ["serviceType", "provider", "areaServed", "offers"] },
  { type: "SoftwareApplication", properties: ["applicationCategory", "operatingSystem", "softwareVersion", "downloadUrl", "offers", "aggregateRating"] },
  { type: "VideoObject", properties: ["thumbnailUrl", "uploadDate", "duration", "contentUrl", "embedUrl", "transcript"] },
  { type: "AudioObject", properties: ["uploadDate", "duration", "contentUrl", "embedUrl", "transcript"] },
  { type: "PodcastEpisode", properties: ["episodeNumber", "partOfSeries", "datePublished", "duration", "associatedMedia"] },
  { type: "Movie", properties: ["director", "actor", "duration", "dateCreated", "trailer", "aggregateRating"] },
  { type: "MusicAlbum", properties: ["byArtist", "numTracks", "albumProductionType", "datePublished"] },
  { type: "WebPage", properties: ["datePublished", "dateModified", "primaryImageOfPage", "breadcrumb", "speakable"] },
  { type: "AboutPage", properties: ["datePublished", "dateModified", "mainEntity"] },
  { type: "ContactPage", properties: ["datePublished", "dateModified", "mainEntity"] },
  { type: "CollectionPage", properties: ["datePublished", "dateModified", "mainEntity"] },
  { type: "ProfilePage", properties: ["datePublished", "dateModified", "mainEntity"] },
  { type: "WebSite", properties: ["alternateName", "publisher", "inLanguage", "potentialAction"] },
];

// A type's own properties first, then the universal ones it doesn't already list.
export function propertiesForJsonLdType(type: string): string[] {
  const own = JSON_LD_TYPE_SUGGESTIONS.find((suggestion) => suggestion.type === type)?.properties;
  if (!own) return UNIVERSAL_PROPERTIES;
  return [...own, ...UNIVERSAL_PROPERTIES.filter((property) => !own.includes(property))];
}
