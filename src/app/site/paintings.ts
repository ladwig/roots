// Paintings used on the website. All public domain (Wikimedia Commons, checked 2026-10-12), stored in
// public/site/paintings (cropped, resized). Credits are shown in the footer.
export const PAINTINGS = {
  harvesters: { src: "/site/paintings/harvesters.jpg", w: 2200, h: 1586, artist: "Pieter Bruegel d. Ä.", title: "Die Kornernte", year: "1565", source: "https://commons.wikimedia.org/wiki/File:Pieter_Bruegel_the_Elder-_The_Harvesters_-_Google_Art_Project.jpg" },
  dance: { src: "/site/paintings/dance.jpg", w: 2200, h: 1508, artist: "Pieter Bruegel d. Ä.", title: "Der Bauerntanz", year: "um 1567", source: "https://commons.wikimedia.org/wiki/File:The_Peasant_Dance_(Bruegel).jpg" },
  galette: { src: "/site/paintings/galette.jpg", w: 2200, h: 1635, artist: "Pierre-Auguste Renoir", title: "Bal du moulin de la Galette", year: "1876", source: "https://commons.wikimedia.org/wiki/File:Renoir,_Pierre-Auguste_-_Dance_at_Le_Moulin_de_la_Galette,_1876.jpg" },
  turf: { src: "/site/paintings/turf.jpg", w: 1712, h: 2200, artist: "Albrecht Dürer", title: "Das große Rasenstück", year: "1503", source: "https://commons.wikimedia.org/wiki/File:Albrecht_D%C3%BCrer_-_The_Large_Piece_of_Turf,_1503_-_Google_Art_Project.jpg" },
  pastoral: { src: "/site/paintings/pastoral.jpg", w: 2200, h: 1706, artist: "Claude Lorrain", title: "Pastorale Landschaft", year: "1636–37", source: "https://commons.wikimedia.org/wiki/File:Claude_Lorrain_-_Pastoral_landscape_-_Google_Art_Project.jpg" },
} as const
export type PaintingKey = keyof typeof PAINTINGS
