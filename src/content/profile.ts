/**
 * The richer profile ("bio"): interests by group, communication styles, quick
 * facts and the prompt bank every member draws a personal deck from.
 *
 * Everything is bilingual {th, en}. Tone (PRD §5.3): short, positive,
 * intentional prompt answers, not a long dating bio. Nothing political or
 * sexual. Spiritual practice and belief are welcome as interests (the
 * "Spiritual" group), framed as things to do, never as an identity to declare.
 *
 * Pure module: no database, no Hono. Validation for every prompt kind lives
 * here so the routes and the tests share one set of rules.
 */
import { createRng, shuffle } from "../vibe/rng";

export type L2 = { th: string; en: string };
export type Opt = { value: string; th: string; en: string; emoji: string };
const o = (value: string, emoji: string, th: string, en: string): Opt => ({ value, emoji, th, en });

// ------------------------------------------------------------ interests --

export type InterestGroup = { key: string; emoji: string; th: string; en: string; items: Opt[] };

export const INTEREST_GROUPS: InterestGroup[] = [
  {
    key: "food",
    emoji: "🍜",
    th: "อาหารและเครื่องดื่ม",
    en: "Food & drink",
    items: [
      o("food", "🍲", "อาหาร", "Food"),
      o("street_food", "🍢", "ตระเวนสตรีทฟู้ด", "Street food crawls"),
      o("cafes", "☕", "คาเฟ่", "Cafés"),
      o("cooking", "🍳", "ทำอาหาร", "Cooking"),
      o("baking", "🧁", "อบขนม", "Baking"),
      o("thai_desserts", "🍡", "ขนมไทย", "Thai desserts"),
      o("coffee_brewing", "🫘", "ดริปกาแฟ", "Coffee brewing"),
      o("tea", "🍵", "ชา", "Tea"),
      o("durian", "🍈", "ฤดูทุเรียน", "Durian season"),
      o("night_markets", "🌙", "ตลาดกลางคืน", "Night markets"),
      o("plant_based", "🥗", "อาหารจากพืช", "Plant-based food"),
      o("noodle_hunting", "🍜", "ล่าก๋วยเตี๋ยวเจ้าเด็ด", "Noodle hunting"),
      o("brunch", "🥞", "บรันช์", "Brunch"),
      o("mookata", "🔥", "หมูกระทะ", "Mookata nights"),
      o("som_tam", "🌶️", "ส้มตำ", "Som tam"),
      o("hotpot", "🫕", "ชาบูและสุกี้", "Shabu & suki"),
      o("bakery_hopping", "🥐", "ตระเวนร้านเบเกอรี่", "Bakery hopping"),
      o("craft_beer", "🍺", "คราฟต์เบียร์", "Craft beer"),
      o("wine", "🍷", "ไวน์", "Wine"),
      o("matcha", "🍵", "มัทฉะ", "Matcha"),
      o("japanese_food", "🍣", "อาหารญี่ปุ่น", "Japanese food"),
      o("korean_food", "🥘", "อาหารเกาหลี", "Korean food"),
      o("yaowarat_eats", "🥮", "ของกินเยาวราช", "Yaowarat eats"),
      o("food_photos", "📸", "ถ่ายรูปอาหาร", "Food photos"),
      o("buffets", "🍤", "บุฟเฟต์", "Buffets"),
      o("mixing_drinks", "🍹", "ชงเครื่องดื่ม", "Mixing drinks"),
    ],
  },
  {
    key: "outdoors",
    emoji: "🏃",
    th: "เอาต์ดอร์และออกกำลังกาย",
    en: "Outdoors & fitness",
    items: [
      o("running", "🏃", "วิ่ง", "Running"),
      o("sports", "🏅", "กีฬา", "Sports"),
      o("cycling", "🚴", "ปั่นจักรยาน", "Cycling"),
      o("park_mornings", "🌳", "เช้าในสวนสาธารณะ", "Park mornings"),
      o("yoga", "🧘", "โยคะ", "Yoga"),
      o("muay_thai", "🥊", "มวยไทย", "Muay Thai"),
      o("badminton", "🏸", "แบดมินตัน", "Badminton"),
      o("football", "⚽", "ฟุตบอล", "Football"),
      o("swimming", "🏊", "ว่ายน้ำ", "Swimming"),
      o("climbing", "🧗", "ปีนผา", "Climbing"),
      o("hiking", "🥾", "เดินป่า", "Hiking"),
      o("khlong_kayak", "🛶", "พายคายักในคลอง", "Khlong kayaking"),
      o("gym", "🏋️", "เข้ายิม", "Gym"),
      o("pickleball", "🏓", "พิกเกิลบอล", "Pickleball"),
      o("skateboarding", "🛹", "สเก็ตบอร์ด", "Skateboarding"),
      o("tennis", "🎾", "เทนนิส", "Tennis"),
      o("basketball", "🏀", "บาสเกตบอล", "Basketball"),
      o("volleyball", "🏐", "วอลเลย์บอล", "Volleyball"),
      o("table_tennis", "🏓", "ปิงปอง", "Table tennis"),
      o("golf", "⛳", "กอล์ฟ", "Golf"),
      o("pilates", "🤸", "พิลาทิส", "Pilates"),
      o("trail_running", "🌄", "เทรลรัน", "Trail running"),
      o("surfskate", "🏄", "เซิร์ฟสเก็ต", "Surfskate"),
      o("frisbee", "🥏", "อัลติเมทฟริสบี", "Ultimate frisbee"),
      o("jiu_jitsu", "🥋", "จูยิตสู", "Jiu-jitsu"),
      o("race_days", "🏅", "งานวิ่ง", "Race days"),
      o("padel", "🎾", "พาเดล", "Padel"),
    ],
  },
  {
    key: "arts",
    emoji: "🎨",
    th: "ศิลปะและงานทำมือ",
    en: "Arts & making",
    items: [
      o("art", "🎨", "ศิลปะ", "Art"),
      o("drawing", "✏️", "วาดรูป", "Drawing"),
      o("pottery", "🏺", "ปั้นเซรามิก", "Pottery"),
      o("crafts", "✂️", "งานฝีมือ", "Crafts"),
      o("knitting", "🧶", "ถักไหมพรม", "Knitting"),
      o("hand_lettering", "✒️", "เขียนตัวอักษรสวย ๆ", "Hand lettering"),
      o("galleries", "🖼️", "เดินแกลเลอรี", "Gallery hopping"),
      o("zines", "📓", "ทำซีน", "Making zines"),
      o("photography", "📷", "ถ่ายรูป", "Photography"),
      o("film_photography", "🎞️", "กล้องฟิล์ม", "Film photography"),
      o("flower_arranging", "💐", "จัดดอกไม้", "Flower arranging"),
      o("sewing", "🧵", "เย็บผ้า", "Sewing"),
      o("watercolour", "🖌️", "สีน้ำ", "Watercolour"),
      o("candle_making", "🕯️", "ทำเทียนหอม", "Candle making"),
      o("leather_craft", "👜", "งานหนัง", "Leather craft"),
      o("embroidery", "🪡", "ปักผ้า", "Embroidery"),
      o("printmaking", "🖼️", "ภาพพิมพ์", "Printmaking"),
      o("digital_art", "🖥️", "ศิลปะดิจิทัล", "Digital art"),
      o("jewellery_making", "💍", "ทำเครื่องประดับ", "Jewellery making"),
      o("woodworking", "🪵", "งานไม้", "Woodworking"),
      o("videography", "📹", "ถ่ายวิดีโอ", "Videography"),
      o("thai_crafts", "🪭", "หัตถกรรมไทย", "Thai crafts"),
      o("art_classes", "🎨", "คลาสศิลปะ", "Art classes"),
    ],
  },
  {
    key: "music",
    emoji: "🎵",
    th: "ดนตรี",
    en: "Music",
    items: [
      o("music", "🎵", "ดนตรี", "Music"),
      o("live_music", "🎤", "ดนตรีสด", "Live music"),
      o("karaoke", "🎙️", "คาราโอเกะ", "Karaoke"),
      o("thai_indie", "🎼", "เพลงอินดี้ไทย", "Thai indie"),
      o("luk_thung", "🪕", "ลูกทุ่งและหมอลำ", "Luk thung & mor lam"),
      o("jazz", "🎷", "แจ๊ส", "Jazz"),
      o("playing_music", "🎸", "เล่นดนตรี", "Playing an instrument"),
      o("dance", "💃", "เต้น", "Dancing"),
      o("vinyl", "💿", "แผ่นเสียง", "Vinyl digging"),
      o("music_festivals", "🎪", "เทศกาลดนตรี", "Music festivals"),
      o("singing", "🎶", "ร้องเพลง", "Singing"),
      o("kpop", "🫶", "เคป็อป", "K-pop"),
      o("classical", "🎻", "ดนตรีคลาสสิก", "Classical"),
      o("hip_hop", "🎧", "ฮิปฮอป", "Hip-hop"),
      o("edm", "🔊", "EDM", "EDM"),
      o("tpop", "🌟", "ทีป็อป", "T-pop"),
      o("rock", "🤘", "ร็อก", "Rock"),
      o("thai_classical_music", "🪘", "ดนตรีไทย", "Thai classical music"),
      o("djing", "🎛️", "เป็นดีเจ", "DJing"),
      o("choir", "🎼", "ร้องประสานเสียง", "Choir"),
      o("musicals", "🎭", "ละครเพลง", "Musicals"),
      o("concerts", "🎟️", "ดูคอนเสิร์ต", "Concerts"),
      o("songwriting", "📝", "แต่งเพลง", "Songwriting"),
    ],
  },
  {
    key: "screen",
    emoji: "🎬",
    th: "หนัง ซีรีส์ และเรื่องเล่า",
    en: "Screen & stories",
    items: [
      o("movies", "🎬", "ดูหนัง", "Movies"),
      o("thai_series", "📺", "ซีรีส์ไทย", "Thai series"),
      o("anime", "🍥", "อนิเมะ", "Anime"),
      o("documentaries", "🎥", "สารคดี", "Documentaries"),
      o("podcasts", "🎧", "พอดแคสต์", "Podcasts"),
      o("books", "📚", "หนังสือ", "Books"),
      o("writing", "✍️", "งานเขียน", "Writing"),
      o("poetry", "🪶", "บทกวี", "Poetry"),
      o("comics", "💥", "การ์ตูนและมังงะ", "Comics & manga"),
      o("theatre", "🎭", "ละครเวที", "Theatre"),
      o("standup", "😂", "สแตนด์อัพคอมเมดี้", "Stand-up comedy"),
      o("kdramas", "💕", "ซีรีส์เกาหลี", "K-dramas"),
      o("horror", "👻", "หนังผี", "Horror films"),
      o("film_festivals", "🎞️", "เทศกาลหนัง", "Film festivals"),
      o("true_crime", "🔎", "คดีปริศนา", "True crime"),
      o("sci_fi", "🛸", "ไซไฟและแฟนตาซี", "Sci-fi & fantasy"),
      o("audiobooks", "🔉", "หนังสือเสียง", "Audiobooks"),
      o("book_fairs", "📕", "งานหนังสือ", "Book fairs"),
      o("reality_shows", "🌟", "เรียลลิตี้โชว์", "Reality shows"),
      o("webtoons", "📱", "เว็บตูน", "Webtoons"),
      o("improv", "🎭", "อิมโพรฟ", "Improv"),
      o("cdramas", "🏮", "ซีรีส์จีน", "C-dramas"),
      o("y_series", "💞", "ซีรีส์วาย", "BL (Y) series"),
    ],
  },
  {
    key: "games",
    emoji: "🎲",
    th: "เกม",
    en: "Games",
    items: [
      o("games", "🎲", "บอร์ดเกม", "Board games"),
      o("video_games", "🎮", "วิดีโอเกม", "Video games"),
      o("puzzles", "🧩", "จิ๊กซอว์และปริศนา", "Puzzles"),
      o("chess", "♟️", "หมากรุก", "Chess"),
      o("trivia", "🧠", "ควิซไนท์", "Trivia nights"),
      o("escape_rooms", "🔐", "ห้องปริศนา", "Escape rooms"),
      o("card_games", "🃏", "เกมไพ่", "Card games"),
      o("tabletop_rpg", "🐉", "เกมเล่นบทบาทบนโต๊ะ", "Tabletop RPGs"),
      o("mobile_games", "📱", "เกมมือถือ", "Mobile games"),
      o("esports", "🏆", "อีสปอร์ต", "Esports"),
      o("party_games", "🐺", "เกมปาร์ตี้และเกมหมาป่า", "Party games & Werewolf"),
      o("mahjong", "🀄", "ไพ่นกกระจอก", "Mahjong"),
      o("rubiks", "🧊", "รูบิก", "Rubik's cubes"),
      o("crosswords", "✏️", "อักษรไขว้", "Crosswords"),
      o("retro_games", "👾", "เกมย้อนยุค", "Retro games"),
      o("bowling", "🎳", "โบว์ลิ่ง", "Bowling"),
      o("arcades", "🕹️", "ตู้เกม", "Arcades"),
      o("pool", "🎱", "พูลและสนุกเกอร์", "Pool & snooker"),
      o("go_game", "⚫", "หมากล้อม", "Go"),
      o("makruk", "🐴", "หมากรุกไทย", "Makruk (Thai chess)"),
    ],
  },
  {
    key: "learning",
    emoji: "🗣️",
    th: "ภาษาและการเรียนรู้",
    en: "Learning & languages",
    items: [
      o("languages", "🗣️", "แลกเปลี่ยนภาษา", "Language exchange"),
      o("learning_thai", "🔤", "เรียนภาษาไทย", "Learning Thai"),
      o("history", "📜", "ประวัติศาสตร์", "History"),
      o("science", "🔬", "วิทยาศาสตร์", "Science"),
      o("philosophy", "💭", "ปรัชญา", "Philosophy"),
      o("workshops", "🛠️", "เวิร์กช็อป", "Workshops"),
      o("museums", "🗿", "พิพิธภัณฑ์", "Museums"),
      o("book_club", "📖", "ชมรมหนังสือ", "Book clubs"),
      o("public_speaking", "📣", "พูดในที่สาธารณะ", "Public speaking"),
      o("astronomy", "🔭", "ดูดาว", "Stargazing"),
      o("learning_chinese", "🏮", "เรียนภาษาจีน", "Learning Chinese"),
      o("learning_japanese", "🗾", "เรียนภาษาญี่ปุ่น", "Learning Japanese"),
      o("learning_korean", "🔠", "เรียนภาษาเกาหลี", "Learning Korean"),
      o("practising_english", "🔡", "ฝึกภาษาอังกฤษ", "Practising English"),
      o("psychology", "🧠", "จิตวิทยา", "Psychology"),
      o("economics", "📈", "เศรษฐศาสตร์", "Economics"),
      o("online_courses", "🎓", "คอร์สออนไลน์", "Online courses"),
      o("talks", "🎤", "ฟังทอล์กและบรรยาย", "Talks & lectures"),
      o("sign_language", "🤟", "ภาษามือ", "Sign language"),
      o("art_history", "🏛️", "ประวัติศาสตร์ศิลปะ", "Art history"),
      o("debate", "💬", "ถกเถียงอย่างสร้างสรรค์", "Friendly debate"),
    ],
  },
  {
    key: "bangkok",
    emoji: "🛺",
    th: "ชีวิตกรุงเทพฯ",
    en: "Bangkok life",
    items: [
      o("city", "🏙️", "สำรวจเมือง", "City exploration"),
      o("culture", "🏮", "วัฒนธรรม", "Culture"),
      o("temple_fairs", "🎡", "งานวัด", "Temple fairs"),
      o("bts_hopping", "🚝", "นั่งรถไฟฟ้าเที่ยว", "BTS hopping"),
      o("river_boats", "⛴️", "นั่งเรือเจ้าพระยา", "Chao Phraya boats"),
      o("old_town_walks", "🏘️", "เดินย่านเก่า", "Old town walks"),
      o("weekend_markets", "🛍️", "ตลาดนัดสุดสัปดาห์", "Weekend markets"),
      o("rooftops", "🌇", "รูฟท็อปชมเมือง", "Rooftop views"),
      o("hidden_alleys", "🗺️", "ตรอกซอกซอย", "Hidden sois"),
      o("neighbourhood", "🏡", "ชีวิตในชุมชน", "Neighbourhood life"),
      o("thai_festivals", "💦", "เทศกาลไทย", "Thai festivals"),
      o("street_art", "🖌️", "สตรีทอาร์ต", "Street art"),
      o("tuk_tuk_rides", "🛺", "นั่งตุ๊กตุ๊ก", "Tuk-tuk rides"),
      o("mall_hangs", "🏬", "เดินห้าง", "Mall hangs"),
      o("night_rides", "🚲", "ปั่นจักรยานกลางคืน", "Night bike rides"),
      o("floating_markets", "🛶", "ตลาดน้ำ", "Floating markets"),
      o("sunset_spots", "🌆", "จุดชมพระอาทิตย์ตก", "Sunset spots"),
      o("design_week", "🧭", "เทศกาลงานออกแบบ", "Design festivals"),
      o("photo_walks", "📷", "เดินถ่ายรูป", "Photo walks"),
      o("pop_ups", "🎪", "อีเวนต์ป๊อปอัป", "Pop-up events"),
      o("neighbourhood_stories", "📜", "เรื่องเล่าของย่าน", "Neighbourhood stories"),
      o("co_working", "💼", "นั่งทำงานนอกบ้าน", "Co-working spots"),
      o("cafe_hopping", "🧋", "ตระเวนคาเฟ่", "Café hopping"),
      o("chinatown", "🧧", "เยาวราชและตลาดน้อย", "Chinatown & Talat Noi"),
    ],
  },
  {
    key: "wellbeing",
    emoji: "🌿",
    th: "สุขภาวะ",
    en: "Wellbeing",
    items: [
      o("meditation", "🪷", "ทำสมาธิ", "Meditation"),
      o("journaling", "📔", "เขียนบันทึก", "Journaling"),
      o("thai_massage", "💆", "นวดไทย", "Thai massage"),
      o("slow_mornings", "🌅", "เช้าช้า ๆ", "Slow mornings"),
      o("plant_care", "🪴", "เลี้ยงต้นไม้", "Plant care"),
      o("mind_care", "💚", "ดูแลใจ", "Looking after your mind"),
      o("walking", "🚶", "เดินเล่น", "Long walks"),
      o("herbal_sauna", "♨️", "อบสมุนไพร", "Herbal sauna"),
      o("sound_baths", "🔔", "ซาวด์บาธ", "Sound baths"),
      o("breathwork", "🌬️", "ฝึกหายใจ", "Breathwork"),
      o("ice_baths", "🧊", "แช่น้ำเย็น", "Ice baths"),
      o("good_sleep", "😴", "นอนให้ดี", "Good sleep"),
      o("eating_well", "🥦", "กินคลีน", "Eating well"),
      o("spa_days", "🛁", "วันสปา", "Spa days"),
      o("tai_chi", "🌄", "ไทเก๊ก", "Tai chi"),
      o("digital_detox", "📵", "พักจากหน้าจอ", "Digital detox"),
      o("personal_growth", "🌱", "พัฒนาตัวเอง", "Personal growth"),
      o("stretching", "🙆", "ยืดเหยียด", "Stretching"),
    ],
  },
  {
    key: "tech",
    emoji: "💡",
    th: "เทคและไอเดีย",
    en: "Tech & ideas",
    items: [
      o("coding", "💻", "เขียนโค้ด", "Coding"),
      o("startups", "🚀", "สตาร์ทอัพ", "Startups"),
      o("ai", "🤖", "AI", "AI"),
      o("gadgets", "📱", "แกดเจ็ต", "Gadgets"),
      o("urbanism", "🏗️", "เมืองและผังเมือง", "Cities & urbanism"),
      o("money_basics", "🐷", "วางแผนการเงินส่วนตัว", "Money basics"),
      o("diy", "🔧", "ประดิษฐ์ DIY", "DIY & making"),
      o("space", "🪐", "อวกาศ", "Space"),
      o("product_design", "📐", "ออกแบบโปรดักต์", "Product design"),
      o("data", "📊", "ข้อมูลและสถิติ", "Data"),
      o("investing", "💹", "การลงทุน", "Investing"),
      o("content_creation", "🎬", "ทำคอนเทนต์", "Making content"),
      o("3d_printing", "🖨️", "พิมพ์สามมิติ", "3D printing"),
      o("robotics", "🦾", "หุ่นยนต์", "Robotics"),
      o("evs", "⚡", "รถยนต์ไฟฟ้า", "Electric vehicles"),
      o("side_projects", "🧪", "โปรเจกต์เสริม", "Side projects"),
      o("productivity", "✅", "จัดการเวลา", "Productivity"),
      o("small_business", "🏪", "ธุรกิจเล็ก ๆ", "Small business"),
      o("marketing", "📣", "การตลาด", "Marketing"),
    ],
  },
  {
    key: "causes",
    emoji: "🤝",
    th: "อาสาและสิ่งที่ใส่ใจ",
    en: "Causes & volunteering",
    items: [
      o("volunteering", "🙌", "อาสาสมัคร", "Volunteering"),
      o("sustainability", "♻️", "ความยั่งยืน", "Sustainability"),
      o("animal_rescue", "🐾", "ช่วยเหลือสัตว์", "Animal rescue"),
      o("cleanups", "🧹", "เก็บขยะในเมือง", "Clean-ups"),
      o("tutoring_kids", "🧒", "สอนหนังสือเด็ก", "Tutoring kids"),
      o("food_sharing", "🍱", "แบ่งปันอาหาร", "Food sharing"),
      o("accessible_city", "♿", "เมืองที่ทุกคนเข้าถึง", "An accessible city"),
      o("time_with_elders", "👵", "ใช้เวลากับผู้สูงวัย", "Time with elders"),
      o("urban_greening", "🌱", "ปลูกต้นไม้ในเมือง", "Urban greening"),
      o("blood_donation", "🩸", "บริจาคเลือด", "Giving blood"),
      o("mentoring", "🧑‍🏫", "เป็นพี่เลี้ยง", "Mentoring"),
      o("zero_waste", "🫙", "ขยะเป็นศูนย์", "Zero waste"),
      o("disaster_relief", "🆘", "ช่วยเหลือภัยพิบัติ", "Disaster relief"),
      o("repair_cafes", "🪛", "ซ่อมแทนทิ้ง", "Repair cafés"),
      o("climate", "🌍", "รับมือโลกร้อน", "Climate action"),
      o("local_shops", "🛒", "อุดหนุนร้านเล็ก", "Supporting local shops"),
      o("first_aid", "⛑️", "ปฐมพยาบาล", "First aid"),
      o("community_kitchens", "🥣", "ครัวชุมชน", "Community kitchens"),
      o("reading_to_kids", "📗", "อ่านหนังสือให้เด็กฟัง", "Reading to kids"),
    ],
  },
  {
    key: "nature",
    emoji: "🐾",
    th: "สัตว์และธรรมชาติ",
    en: "Pets & nature",
    items: [
      o("pets", "🐶", "สัตว์เลี้ยง", "Pets"),
      o("cats", "🐈", "แมว", "Cats"),
      o("dogs", "🐕", "หมา", "Dogs"),
      o("birdwatching", "🐦", "ดูนก", "Birdwatching"),
      o("gardening", "🌻", "ทำสวน", "Gardening"),
      o("beaches", "🏖️", "ทะเล", "Beaches"),
      o("mangroves", "🌿", "ป่าชายเลน", "Mangroves & wetlands"),
      o("aquariums", "🐠", "ปลาสวยงาม", "Fish & aquariums"),
      o("reptiles", "🦎", "สัตว์เลื้อยคลาน", "Reptiles"),
      o("small_pets", "🐹", "สัตว์เลี้ยงตัวเล็ก", "Small pets"),
      o("national_parks", "🏞️", "อุทยานแห่งชาติ", "National parks"),
      o("diving", "🤿", "ดำน้ำ", "Diving & snorkelling"),
      o("waterfalls", "💧", "น้ำตก", "Waterfalls"),
      o("butterflies", "🦋", "ผีเสื้อและแมลง", "Butterflies & bugs"),
      o("animal_cafes", "🐾", "คาเฟ่สัตว์", "Animal cafés"),
      o("fishing", "🎣", "ตกปลา", "Fishing"),
      o("rabbits", "🐇", "กระต่าย", "Rabbits"),
    ],
  },
  {
    key: "social",
    emoji: "🌃",
    th: "ไนท์ไลฟ์และสังสรรค์",
    en: "Nightlife & social",
    items: [
      o("nightlife", "🌃", "ไนท์ไลฟ์", "Nightlife"),
      o("cocktail_bars", "🍸", "บาร์ค็อกเทล", "Cocktail bars"),
      o("dinner_parties", "🍽️", "ปาร์ตี้มื้อค่ำ", "Dinner parties"),
      o("clubbing", "🪩", "ไปคลับ", "Dancing out"),
      o("meeting_people", "👋", "เจอเพื่อนใหม่", "Meeting new people"),
      o("picnics", "🧺", "ปิกนิก", "Picnics"),
      o("hosting", "🫖", "เป็นเจ้าบ้านชวนเพื่อน", "Hosting friends"),
      o("late_night_eats", "🥟", "ของกินดึก", "Late-night eats"),
      o("speakeasies", "🗝️", "บาร์ลับ", "Speakeasies"),
      o("watch_parties", "📺", "ดูบอลกับเพื่อน", "Watch parties"),
      o("game_nights", "🎲", "คืนเล่นเกม", "Game nights"),
      o("potlucks", "🥘", "พอตลัก", "Potlucks"),
      o("night_walks", "🌙", "เดินเล่นยามค่ำ", "Night walks"),
      o("sober_socials", "🧃", "สังสรรค์แบบไม่ดื่ม", "Alcohol-free socials"),
      o("birthday_plans", "🎂", "จัดวันเกิด", "Birthday plans"),
      o("open_mics", "🎤", "โอเพนไมค์", "Open mics"),
      o("networking", "🤝", "เน็ตเวิร์กกิ้ง", "Networking"),
      o("brunch_clubs", "🥂", "แก๊งบรันช์", "Brunch crews"),
    ],
  },
  {
    key: "travel",
    emoji: "✈️",
    th: "ท่องเที่ยว",
    en: "Travel",
    items: [
      o("travel", "✈️", "ท่องเที่ยว", "Travel"),
      o("weekend_trips", "🚗", "ทริปสุดสัปดาห์", "Weekend trips"),
      o("backpacking", "🎒", "แบ็กแพ็ก", "Backpacking"),
      o("islands", "🏝️", "เกาะ", "Islands"),
      o("train_journeys", "🚂", "นั่งรถไฟ", "Train journeys"),
      o("camping", "⛺", "แคมปิ้ง", "Camping"),
      o("mountains", "⛰️", "ภูเขา", "Mountains"),
      o("road_trips", "🛣️", "โรดทริป", "Road trips"),
      o("solo_travel", "🧳", "เที่ยวคนเดียว", "Solo travel"),
      o("japan_trips", "🗾", "เที่ยวญี่ปุ่น", "Trips to Japan"),
      o("upcountry", "🌾", "เที่ยวต่างจังหวัด", "Upcountry trips"),
      o("glamping", "🏕️", "แกลมปิ้ง", "Glamping"),
      o("trip_planning", "🗓️", "วางแผนเที่ยว", "Planning trips"),
      o("motorbike_trips", "🏍️", "ทริปมอเตอร์ไซค์", "Motorbike trips"),
      o("staycations", "🏨", "สเตย์เคชัน", "Staycations"),
      o("cafe_trips", "☕", "ทริปคาเฟ่ต่างจังหวัด", "Café road trips"),
      o("city_breaks", "🌏", "เที่ยวเมืองต่างประเทศ", "City breaks abroad"),
    ],
  },
  {
    key: "style",
    emoji: "✨",
    th: "สไตล์และดีไซน์",
    en: "Style & design",
    items: [
      o("fashion", "👗", "แฟชั่น", "Fashion"),
      o("thrifting", "🧥", "ของมือสอง", "Thrifting"),
      o("interiors", "🛋️", "แต่งบ้าน", "Interiors"),
      o("architecture", "🏢", "สถาปัตยกรรม", "Architecture"),
      o("graphic_design", "🖍️", "กราฟิกดีไซน์", "Graphic design"),
      o("skincare", "🧴", "สกินแคร์", "Skincare"),
      o("sneakers", "👟", "สนีกเกอร์", "Sneakers"),
      o("vintage", "📻", "ของวินเทจ", "Vintage finds"),
      o("makeup", "💄", "แต่งหน้า", "Makeup"),
      o("perfume", "🌸", "น้ำหอม", "Perfume"),
      o("hair", "💇", "ทำผม", "Hair"),
      o("nail_art", "💅", "ทำเล็บ", "Nail art"),
      o("watches", "⌚", "นาฬิกา", "Watches"),
      o("thai_textiles", "🧣", "ผ้าไทย", "Thai textiles"),
      o("minimalism", "⬜", "มินิมอล", "Minimalism"),
      o("tattoo_art", "🖋️", "ศิลปะรอยสัก", "Tattoo art"),
      o("tidying", "🗂️", "จัดบ้าน", "Tidying up"),
      o("streetwear", "🧢", "สตรีทแวร์", "Streetwear"),
    ],
  },
  {
    key: "collecting",
    emoji: "🧸",
    th: "สะสมและงานอดิเรก",
    en: "Collecting & hobbies",
    items: [
      o("art_toys", "🧸", "อาร์ตทอย", "Art toys"),
      o("lego", "🧱", "เลโก้", "LEGO"),
      o("model_kits", "🛠️", "โมเดลและกันพลา", "Model kits & Gunpla"),
      o("trading_cards", "🎴", "การ์ดสะสม", "Trading cards"),
      o("cosplay", "🦸", "คอสเพลย์", "Cosplay"),
      o("stamps", "📮", "สะสมแสตมป์", "Stamp collecting"),
      o("magic_tricks", "🎩", "มายากล", "Magic tricks"),
      o("origami", "🦢", "พับกระดาษ", "Origami"),
      o("custom_keyboards", "⌨️", "คีย์บอร์ดคัสตอม", "Custom keyboards"),
      o("fountain_pens", "🖊️", "ปากกาหมึกซึม", "Fountain pens"),
      o("cars", "🚗", "รถยนต์", "Cars"),
      o("stickers", "🏷️", "สติกเกอร์", "Stickers"),
    ],
  },
  {
    key: "fans",
    emoji: "🏟️",
    th: "เชียร์กีฬา",
    en: "Sports fans",
    items: [
      o("watching_football", "⚽", "ดูบอล", "Watching football"),
      o("thai_league", "🏟️", "ไทยลีก", "Thai League"),
      o("premier_league", "🦁", "พรีเมียร์ลีก", "Premier League"),
      o("thai_volleyball", "🏐", "เชียร์วอลเลย์บอลไทย", "Thai volleyball"),
      o("watching_muay_thai", "🥊", "ดูมวย", "Watching Muay Thai"),
      o("f1", "🏎️", "F1", "F1"),
      o("nba", "🏀", "NBA", "NBA"),
      o("watching_tennis", "🎾", "ดูเทนนิส", "Watching tennis"),
      o("watching_badminton", "🏸", "ดูแบดมินตัน", "Watching badminton"),
      o("big_games", "🥇", "โอลิมปิกและมหกรรมกีฬา", "The Olympics & big games"),
      o("fantasy_football", "📋", "แฟนตาซีฟุตบอล", "Fantasy football"),
    ],
  },
  {
    key: "spiritual",
    emoji: "🪷",
    th: "จิตวิญญาณและความเชื่อ",
    en: "Spiritual",
    items: [
      o("amulets", "🧿", "พระเครื่องและเครื่องราง", "Amulets & charms"),
      o("temple_visits", "🛕", "ไหว้พระทำบุญ", "Temple visits & merit-making"),
      o("shrine_hopping", "🙏", "ไหว้สิ่งศักดิ์สิทธิ์", "Shrine hopping"),
      o("dharma_talks", "📿", "ฟังธรรม", "Dharma talks"),
      o("meditation_retreats", "🏞️", "ปฏิบัติธรรม", "Meditation retreats"),
      o("chanting", "🕯️", "สวดมนต์", "Chanting"),
      o("astrology", "♈", "โหราศาสตร์", "Astrology"),
      o("tarot", "🔮", "ไพ่ทาโรต์", "Tarot"),
      o("fortune_telling", "🪬", "ดูดวง", "Fortune telling"),
      o("numerology", "🔢", "เลขศาสตร์", "Numerology"),
      o("lucky_colours", "🌈", "สีมงคล", "Lucky colours"),
      o("feng_shui", "🧭", "ฮวงจุ้ย", "Feng shui"),
      o("crystals", "💎", "คริสตัลและหินมงคล", "Crystals"),
      o("manifesting", "✨", "ดึงดูดสิ่งดี ๆ", "Manifesting"),
      o("vegetarian_festival", "🥬", "เทศกาลกินเจ", "Vegetarian festival"),
      o("supernatural", "👻", "เรื่องลี้ลับ", "The supernatural"),
      o("faith_community", "🤲", "กิจกรรมทางศาสนา", "Faith community"),
      o("spiritual_books", "📘", "หนังสือธรรมะและจิตวิญญาณ", "Spiritual reading"),
    ],
  },
];

export const ALL_INTERESTS: Opt[] = INTEREST_GROUPS.flatMap((g) => g.items);
const INTEREST_BY_VALUE = new Map(ALL_INTERESTS.map((i) => [i.value, i]));
export const INTEREST_VALUES: string[] = ALL_INTERESTS.map((i) => i.value);
export const MAX_INTERESTS = 15;

export function interestOpt(value: string): Opt | undefined {
  return INTEREST_BY_VALUE.get(value);
}

/** "🍢 Street food crawls" (unknown legacy values come back as-is). */
export function interestLabel(value: string, lang: "th" | "en"): string {
  const i = INTEREST_BY_VALUE.get(value);
  return i ? `${i.emoji} ${lang === "en" ? i.en : i.th}` : value;
}

// ------------------------------------------------------ communication --

export type CommStyle = Opt & { blurb: L2 };
const cs = (value: string, emoji: string, th: string, en: string, bth: string, ben: string): CommStyle => ({ ...o(value, emoji, th, en), blurb: { th: bth, en: ben } });

export const COMM_STYLES: CommStyle[] = [
  cs("texter", "💬", "สายพิมพ์", "Texter", "ตอบไวในแชต", "Quick replies in chat"),
  cs("voice_noter", "🎙️", "สายวอยซ์", "Voice-noter", "เล่าเป็นเสียงสะดวกกว่า", "Easier to say it out loud"),
  cs("caller", "📞", "สายโทร", "Caller", "โทรคุยห้านาทีจบ", "A five-minute call sorts it"),
  cs("meme_sender", "😂", "สายส่งมีม", "Meme sender", "สื่อสารด้วยมีมเป็นหลัก", "Speaks fluent meme"),
  cs("planner", "📅", "สายนัดเจอ", "In-person planner", "ขอวันเวลาสถานที่ชัด ๆ", "Date, time, place, done"),
  cs("slow_replier", "🐢", "ตอบช้าแต่ตอบแน่", "Slow but sure replier", "ไม่ได้เมิน แค่ใช้ชีวิตอยู่", "Not ignoring you, just living"),
  cs("emoji_fan", "🥹", "สายอีโมจิ", "Emoji enthusiast", "หนึ่งอีโมจิแทนพันคำ", "One emoji, a thousand words"),
  cs("long_writer", "📜", "สายข้อความยาว", "Long-message writer", "เขียนยาวด้วยความตั้งใจ", "Writes long, with care"),
  cs("sticker_fan", "🐻", "สายสติกเกอร์ LINE", "LINE sticker fan", "มีสติกเกอร์ตอบทุกสถานการณ์", "A sticker for every moment"),
  cs("lets_meet", "🤝", "เจอกันเลยดีกว่า", "Let's just meet", "คุยต่อหน้าสนุกกว่า", "Talking face to face is better"),
  cs("video_caller", "📹", "สายวิดีโอคอล", "Video caller", "อยากเห็นหน้าตอนคุย", "Likes to see faces"),
];
export const MAX_COMM = 3;

// --------------------------------------------------------- quick facts --

export const ENERGY: Opt[] = [
  o("chill", "🌿", "ชิล ๆ", "Chill"),
  o("curious", "🔍", "ช่างสงสัย", "Curious"),
  o("chatty", "🗣️", "ช่างคุย", "Chatty"),
  o("listener", "👂", "นักฟังที่ดี", "Good listener"),
  o("playful", "🎈", "ขี้เล่น", "Playful"),
  o("warm_slow", "🌤️", "อุ่นเครื่องช้าหน่อย", "Warms up slowly"),
];

export const WEEKEND_RHYTHM: Opt[] = [
  o("early_bird", "🌅", "ตื่นเช้าออกไปข้างนอก", "Early bird outside"),
  o("lazy_brunch", "🥞", "ตื่นสายแล้วบรันช์", "Late start, then brunch"),
  o("out_all_day", "🚶", "ออกไปทั้งวัน", "Out all day"),
  o("night_owl", "🦉", "คึกคักตอนกลางคืน", "Night owl"),
  o("homebody", "🏠", "ชาร์จพลังที่บ้าน", "Recharging at home"),
  o("spontaneous", "🎲", "แล้วแต่วันนั้น", "Decided on the day"),
];

export const HEADLINE_MAX = 60;

/** Occupation: one pick from this list, or "other" plus the member's own words. */
export const OCCUPATIONS: Opt[] = [
  o("student", "🎓", "นักเรียน นักศึกษา", "Student"),
  o("office", "💼", "พนักงานออฟฟิศ", "Office worker"),
  o("tech", "💻", "ไอทีและเทค", "Tech & IT"),
  o("creative", "🎨", "งานสร้างสรรค์และดีไซน์", "Creative & design"),
  o("media", "📰", "สื่อ คอนเทนต์ และการตลาด", "Media, content & marketing"),
  o("education", "🍎", "ครูและการศึกษา", "Teaching & education"),
  o("health", "🩺", "การแพทย์และสุขภาพ", "Healthcare"),
  o("finance", "📊", "การเงินและบัญชี", "Finance & accounting"),
  o("law", "⚖️", "กฎหมาย", "Law"),
  o("engineering", "🏗️", "วิศวกรรมและก่อสร้าง", "Engineering & construction"),
  o("science", "🔬", "วิทยาศาสตร์และวิจัย", "Science & research"),
  o("government", "🏛️", "ราชการและรัฐวิสาหกิจ", "Government & public sector"),
  o("hospitality", "🏨", "โรงแรมและท่องเที่ยว", "Hospitality & tourism"),
  o("food", "👩‍🍳", "อาหารและเครื่องดื่ม", "Food & drink"),
  o("retail", "🛍️", "ค้าขายและค้าปลีก", "Retail & sales"),
  o("own_business", "🏪", "เจ้าของกิจการ", "Own business"),
  o("freelance", "🧑‍💻", "ฟรีแลนซ์", "Freelance"),
  o("arts", "🎭", "ศิลปินและนักแสดง", "Arts & performing"),
  o("beauty", "💇", "ความงามและแฟชั่น", "Beauty & fashion"),
  o("fitness", "🏋️", "กีฬาและฟิตเนส", "Sport & fitness"),
  o("transport", "🚚", "ขนส่งและโลจิสติกส์", "Transport & logistics"),
  o("trades", "🔧", "ช่างและงานฝีมือ", "Skilled trades"),
  o("ngo", "🤝", "องค์กรไม่แสวงกำไร", "Non-profit"),
  o("caregiver", "🏡", "ดูแลบ้านและครอบครัว", "Home & family"),
  o("between_jobs", "🧭", "กำลังหางานใหม่", "Between jobs"),
  o("retired", "🌴", "เกษียณ", "Retired"),
  o("other", "✏️", "อื่น ๆ (พิมพ์เอง)", "Other (type your own)"),
];
export const OCCUPATION_OTHER_MAX = 40;

/** The occupation to show, or null: "other" shows the member's own words. */
export function occupationLabel(bio: Bio, lang: "th" | "en"): { emoji: string; text: string } | null {
  const occ = OCCUPATIONS.find((x) => x.value === bio.occupation);
  if (!occ) return null;
  if (occ.value === "other") return bio.occupationOther ? { emoji: occ.emoji, text: bio.occupationOther } : null;
  return { emoji: occ.emoji, text: lang === "en" ? occ.en : occ.th };
}

/** Read the occupation pair off a form. Unknown picks and an empty "other" become unset. */
export function parseOccupation(occupation: string, other: string): Pick<Bio, "occupation" | "occupationOther"> {
  if (!OCCUPATIONS.some((x) => x.value === occupation)) return { occupation: undefined, occupationOther: undefined };
  if (occupation !== "other") return { occupation, occupationOther: undefined };
  const text = other.trim().slice(0, OCCUPATION_OTHER_MAX);
  return text ? { occupation, occupationOther: text } : { occupation: undefined, occupationOther: undefined };
}
export const LEARNING_MAX = 60;

// ---------------------------------------------------------- prompt bank --

export type PromptKind = "text" | "slider" | "scale" | "choice" | "multi" | "photo" | "emoji" | "rank";
export const PROMPT_KINDS: PromptKind[] = ["text", "slider", "scale", "choice", "multi", "photo", "emoji", "rank"];

export type Prompt = {
  id: string;
  kind: PromptKind;
  th: string;
  en: string;
  emoji: string;
  /** slider */
  min?: number;
  max?: number;
  step?: number;
  /** slider / scale: labels for the low and high ends. */
  ends?: [L2, L2];
  /** choice / multi / emoji / rank */
  options?: Opt[];
  /** multi / emoji: how many may be picked (default 1 for emoji, 3 for multi). */
  pick?: number;
};

export const TEXT_MAX = 140;
export const CAPTION_MAX = 80;

const ends = (lth: string, len: string, hth: string, hen: string): [L2, L2] => [
  { th: lth, en: len },
  { th: hth, en: hen },
];
const text = (id: string, emoji: string, th: string, en: string): Prompt => ({ id, kind: "text", emoji, th, en });
const photo = (id: string, emoji: string, th: string, en: string): Prompt => ({ id, kind: "photo", emoji, th, en });
const slider = (id: string, emoji: string, th: string, en: string, min: number, max: number, step: number, e: [L2, L2]): Prompt => ({ id, kind: "slider", emoji, th, en, min, max, step, ends: e });
const scale = (id: string, emoji: string, th: string, en: string, e: [L2, L2]): Prompt => ({ id, kind: "scale", emoji, th, en, min: 1, max: 5, step: 1, ends: e });
const choice = (id: string, emoji: string, th: string, en: string, options: Opt[]): Prompt => ({ id, kind: "choice", emoji, th, en, options });
const multi = (id: string, emoji: string, th: string, en: string, options: Opt[], pick = 3): Prompt => ({ id, kind: "multi", emoji, th, en, options, pick });
const rank = (id: string, emoji: string, th: string, en: string, options: Opt[]): Prompt => ({ id, kind: "rank", emoji, th, en, options });
/** Emoji prompts: the option value IS the emoji. Space-separated list. */
const em = (list: string): Opt[] => list.split(" ").filter(Boolean).map((e) => o(e, e, e, e));
const emoji = (id: string, icon: string, th: string, en: string, list: string, pick = 1): Prompt => ({ id, kind: "emoji", emoji: icon, th, en, options: em(list), pick });

export const PROMPT_BANK: Prompt[] = [
  // --- short answers
  text("dream_city", "🌆", "เมืองในฝันของฉันคือ…", "My dream city is…"),
  text("show_visitor", "📍", "ที่แรกในกรุงเทพฯ ที่จะพาเพื่อนต่างถิ่นไป", "The Bangkok spot I'd show a visitor first"),
  text("small_thing", "🌼", "เรื่องเล็ก ๆ ที่ทำให้สัปดาห์ของฉันดีขึ้น", "A small thing that makes my week"),
  text("weirdly_good", "🪄", "ฉันเก่งเรื่องนี้แบบแปลก ๆ", "I'm weirdly good at"),
  text("teach_30s", "⏱️", "ให้ฉันสอนอะไรคุณใน 30 วินาที", "Teach me something in 30 seconds"),
  text("defend_street_food", "🍢", "สตรีทฟู้ดที่ฉันพร้อมปกป้องตลอดไป", "Street food I'd defend forever"),
  text("learning_now", "🌱", "ช่วงนี้กำลังหัดทำ…", "Something I'm learning right now"),
  text("ask_me_about", "🙋", "ถามฉันเรื่องนี้ได้ทั้งวัน", "Ask me about this all day"),
  text("proud_of", "🏅", "เรื่องเล็ก ๆ ที่ภูมิใจเมื่อเร็ว ๆ นี้", "A small win I'm proud of lately"),
  text("comfort_meal", "🍛", "อาหารปลอบใจของฉันคือ", "My comfort meal is"),
  text("best_advice", "💡", "คำแนะนำที่ดีที่สุดที่เคยได้รับ", "The best advice I've been given"),
  text("hidden_gem", "💎", "ร้านลับที่อยากให้คนรู้จักมากกว่านี้", "A hidden gem that deserves more love"),
  text("never_bored", "🔁", "ทำซ้ำได้ไม่มีเบื่อ", "Something I could do on repeat"),
  text("grateful_for", "🙏", "ช่วงนี้รู้สึกขอบคุณเรื่อง", "Lately I'm grateful for"),
  text("green_flag", "💚", "สิ่งที่ทำให้ฉันรู้สึกว่าเพื่อนคนนี้ใช่", "A green flag in a new friend"),
  text("perfect_soi", "🛵", "ซอยที่ฉันรักที่สุดในเมือง", "My favourite soi in the city"),
  text("rainy_day", "🌧️", "วันฝนตกในกรุงเทพฯ ฉันจะ…", "On a rainy Bangkok day I…"),
  text("song_on_loop", "🎧", "เพลงที่วนฟังอยู่ตอนนี้", "The song I have on loop"),
  text("bucket_list", "🗺️", "สิ่งที่อยากทำในกรุงเทพฯ สักครั้ง", "A Bangkok bucket-list item"),
  text("unpopular_opinion", "🤔", "ความเห็นเบา ๆ ที่ไม่ค่อยมีคนเห็นด้วย", "A harmless unpopular opinion"),
  text("first_job", "🧃", "งานแรกที่เคยทำ", "The first job I ever had"),
  text("together_try", "🤝", "อยากหาเพื่อนไปลอง…ด้วยกัน", "Looking for someone to try this with"),
  text("childhood_snack", "🍬", "ขนมวัยเด็กที่ยังคิดถึง", "A childhood snack I still miss"),
  text("happy_place", "🌿", "ที่ที่ทำให้ใจสงบ", "My happy place"),
  text("five_years", "🔭", "อีก 5 ปี อยากเก่งเรื่องอะไรขึ้น", "In five years I'd love to be better at"),
  text("city_wish", "🏙️", "ถ้าเปลี่ยนกรุงเทพฯ ได้ 1 อย่าง", "One thing I'd change about Bangkok"),
  text("story_in_six", "📝", "เล่าเรื่องตัวเองใน 6 คำ", "My story in six words"),
  text("kindness_seen", "🫶", "ความใจดีจากคนแปลกหน้าที่จำได้", "A stranger's kindness I still remember"),

  // --- sliders
  slider("spice", "🌶️", "ระดับความเผ็ดที่ไหว", "Spice tolerance", 0, 10, 1, ends("ไม่เผ็ดเลย", "No chilli", "พริก 10 เม็ด", "Ten chillies")),
  slider("sweetness", "🧋", "ระดับความหวานชานม", "Bubble tea sweetness", 0, 100, 25, ends("ไม่หวาน", "0%", "หวานเต็ม", "100%")),
  slider("early_late", "⏰", "เช้าหรือดึก", "Morning person or night owl", 0, 10, 1, ends("คนตื่นเช้า", "Sunrise", "นกฮูก", "Night owl")),
  slider("plan_spont", "🗓️", "วางแผนหรือแล้วแต่ดวง", "Planner or spontaneous", 0, 10, 1, ends("วางแผนทุกนาที", "Every minute planned", "ไปเลย", "Let's just go")),
  slider("walk_km", "🚶", "เดินได้กี่กิโลก่อนขอนั่งพัก", "How far I'll walk before a sit-down (km)", 0, 15, 1, ends("ขอนั่งเลย", "Seat please", "เดินได้ทั้งวัน", "All day")),
  slider("punctual", "⌚", "มาก่อนนัดหรือมาสายนิดหน่อย", "Early or fashionably late", 0, 10, 1, ends("มาก่อน 10 นาที", "Ten minutes early", "ขอสายนิดนึง", "A little late")),
  slider("aircon", "❄️", "อุณหภูมิแอร์ที่ใช่", "My ideal aircon temperature (°C)", 18, 30, 1, ends("ขั้วโลก", "Arctic", "พัดลมพอ", "Fan is fine")),
  slider("group_size", "👥", "ขนาดกลุ่มที่สบายใจ", "My comfy group size", 2, 12, 1, ends("คุยกันสองคน", "Just two", "ยิ่งเยอะยิ่งสนุก", "The more the merrier")),
  slider("coffee_cups", "☕", "กาแฟต่อวัน", "Coffees a day", 0, 6, 1, ends("ไม่ดื่มเลย", "None", "เติมไม่หยุด", "Refill please")),
  slider("photo_per_meal", "📸", "ถ่ายรูปอาหารก่อนกินกี่รูป", "Food photos before the first bite", 0, 10, 1, ends("กินเลย", "Dig in", "ขออีกมุม", "One more angle")),
  slider("bkk_years", "🏙️", "อยู่กรุงเทพฯ มากี่ปี", "Years I've called Bangkok home", 0, 40, 1, ends("เพิ่งมา", "Just arrived", "ตั้งแต่เกิด", "Since forever")),

  // --- scales (1 to 5)
  scale("chatty_scale", "🗣️", "ในวงสนทนาใหม่ ฉันคุยแค่ไหน", "In a new group I talk", ends("ฟังมากกว่า", "Mostly listen", "เปิดประเด็นเอง", "Start the topic")),
  scale("adventure_food", "🦗", "กล้าลองอาหารแปลกใหม่แค่ไหน", "How adventurous I am with food", ends("ของเดิมดีแล้ว", "My usual, thanks", "ลองหมด", "Try everything")),
  scale("tidy", "🧺", "ห้องของฉันเรียบร้อยแค่ไหน", "How tidy my room is", ends("วุ่นวายแบบมีระบบ", "Organised chaos", "เป๊ะมาก", "Showroom")),
  scale("karaoke_brave", "🎤", "ความกล้าร้องคาราโอเกะ", "Karaoke courage", ends("ขอเป็นผู้ฟัง", "Audience only", "ขอไมค์", "Hand me the mic")),
  scale("outdoorsy", "🌳", "สายในร่มหรือกลางแจ้ง", "Indoors or outdoors", ends("ห้องแอร์", "Aircon life", "ข้างนอกตลอด", "Always outside")),
  scale("trying_new", "🧭", "ชอบลองอะไรใหม่ ๆ แค่ไหน", "How much I love trying new things", ends("ของเดิมสบายใจ", "Comfort zone", "ไม่เคยลองต้องลอง", "Never tried? Yes")),
  scale("reply_speed", "📲", "ความเร็วในการตอบแชต", "How fast I reply", ends("วันถัดไป", "Next day", "ทันที", "Instantly")),
  scale("dance_floor", "🪩", "บนฟลอร์เต้น ฉัน…", "On a dance floor I'm", ends("ยืนโยกเบา ๆ", "Gentle sway", "จัดเต็ม", "All in")),
  scale("deep_talk", "🌌", "ชอบคุยเรื่องลึก ๆ แค่ไหน", "How much I like deep talks", ends("เรื่องเบา ๆ ดีกว่า", "Keep it light", "คุยถึงตีสอง", "Until 2am")),
  scale("competitive", "🏆", "เวลาเล่นเกม ฉันจริงจังแค่ไหน", "How competitive I get at games", ends("สนุกพอ", "Just for fun", "ต้องชนะ", "Here to win")),

  // --- this or that
  choice("mango_sticky", "🥭", "ข้าวเหนียวมะม่วง หรือ บิงซู", "Mango sticky rice or bingsu", [o("mango", "🥭", "ข้าวเหนียวมะม่วง", "Mango sticky rice"), o("bingsu", "🍧", "บิงซู", "Bingsu")]),
  choice("bts_boat", "🚝", "รถไฟฟ้า หรือ เรือ", "Skytrain or river boat", [o("bts", "🚝", "รถไฟฟ้า", "Skytrain"), o("boat", "⛴️", "เรือ", "River boat"), o("motorbike", "🛵", "วินมอเตอร์ไซค์", "Motorbike taxi")]),
  choice("sunrise_sunset", "🌅", "พระอาทิตย์ขึ้น หรือ ตก", "Sunrise or sunset", [o("sunrise", "🌅", "พระอาทิตย์ขึ้น", "Sunrise"), o("sunset", "🌇", "พระอาทิตย์ตก", "Sunset")]),
  choice("mall_market", "🛍️", "ห้าง หรือ ตลาดนัด", "Mall or market", [o("mall", "🏬", "ห้างแอร์เย็น", "Air-conditioned mall"), o("market", "🛍️", "ตลาดนัด", "Open-air market")]),
  choice("beach_mountain", "🏖️", "ทะเล หรือ ภูเขา", "Beach or mountains", [o("beach", "🏖️", "ทะเล", "Beach"), o("mountain", "⛰️", "ภูเขา", "Mountains"), o("city", "🏙️", "เมืองใหม่", "A new city")]),
  choice("cat_dog", "🐾", "ทีมแมว หรือ ทีมหมา", "Team cat or team dog", [o("cat", "🐈", "ทีมแมว", "Team cat"), o("dog", "🐕", "ทีมหมา", "Team dog"), o("both", "🫶", "รักหมด", "Love them all")]),
  choice("som_tam", "🥗", "ส้มตำไทย หรือ ส้มตำปูปลาร้า", "Som tam Thai or som tam pu pla ra", [o("thai", "🥜", "ส้มตำไทย", "Som tam Thai"), o("pla_ra", "🦀", "ปูปลาร้า", "Pu pla ra"), o("fruit", "🍉", "ตำผลไม้", "Fruit som tam")]),
  choice("call_text", "📞", "โทร หรือ พิมพ์", "Call or text", [o("call", "📞", "โทรเลย", "Call me"), o("text", "💬", "พิมพ์ดีกว่า", "Text me"), o("voice", "🎙️", "ส่งวอยซ์", "Voice note")]),
  choice("plan_role", "🗺️", "ในทริปกับเพื่อน ฉันเป็น…", "On a group trip I'm the", [o("planner", "📋", "คนวางแผน", "Planner"), o("navigator", "🧭", "คนนำทาง", "Navigator"), o("snacks", "🍪", "ฝ่ายเสบียง", "Snack keeper"), o("photographer", "📸", "ช่างภาพ", "Photographer")]),
  choice("noodle_type", "🍜", "เส้นที่ใช่", "My noodle of choice", [o("sen_lek", "🍜", "เส้นเล็ก", "Sen lek"), o("ba_mee", "🍝", "บะหมี่", "Egg noodles"), o("woon_sen", "🥢", "วุ้นเส้น", "Glass noodles"), o("sen_yai", "🍲", "เส้นใหญ่", "Wide noodles")]),
  choice("rain_plan", "☔", "ฝนตกหนักตอนนัด", "Heavy rain before plans", [o("go_anyway", "☔", "ไปต่อ เปียกก็ช่าง", "Go anyway"), o("move_inside", "🏠", "ย้ายเข้าร่ม", "Move it indoors"), o("reschedule", "📅", "เลื่อนนัด", "Reschedule")]),
  choice("coffee_order", "☕", "กาแฟแก้วโปรด", "My coffee order", [o("black", "☕", "อเมริกาโน่", "Americano"), o("thai_iced", "🧋", "โอเลี้ยง/กาแฟเย็น", "Thai iced coffee"), o("latte", "🥛", "ลาเต้", "Latte"), o("no_coffee", "🍵", "ไม่ดื่มกาแฟ", "No coffee, thanks")]),
  choice("meet_where", "📍", "เจอกันครั้งแรกที่ไหนดี", "Best first hangout spot", [o("cafe", "☕", "คาเฟ่", "A café"), o("park", "🌳", "สวน", "A park"), o("activity", "🎳", "ทำกิจกรรม", "An activity"), o("food_walk", "🍢", "เดินกิน", "A food walk")]),
  choice("songkran", "💦", "สงกรานต์ ฉัน…", "At Songkran I", [o("splash", "🔫", "ลุยเต็มที่", "Splash all day"), o("temple", "🏮", "รดน้ำดำหัว", "Visit family and temples"), o("escape", "🏝️", "หนีไปพัก", "Escape the city")]),
  choice("night_in_out", "🌙", "ศุกร์คืนนี้", "This Friday night", [o("out", "🌃", "ออกไปข้างนอก", "Out and about"), o("in", "🛋️", "อยู่บ้านสบาย ๆ", "Cosy night in"), o("both", "🍜", "กินข้าวแล้วกลับ", "Dinner, then home")]),

  // --- pick up to 3
  multi("perfect_weekend", "🧺", "สุดสัปดาห์ในฝัน (เลือกได้ 3)", "My perfect weekend has (pick 3)", [
    o("market", "🛍️", "ตลาดนัด", "A market"),
    o("brunch", "🥞", "บรันช์", "Brunch"),
    o("museum", "🗿", "พิพิธภัณฑ์", "A museum"),
    o("park", "🌳", "สวนสาธารณะ", "A park"),
    o("nap", "😴", "งีบกลางวัน", "A nap"),
    o("live_music", "🎤", "ดนตรีสด", "Live music"),
    o("cooking", "🍳", "ทำอาหาร", "Cooking"),
    o("friends", "👯", "เจอเพื่อน", "Friends"),
  ]),
  multi("friend_qualities", "💚", "สิ่งที่ฉันให้ได้ในฐานะเพื่อน", "What I bring as a friend", [
    o("listener", "👂", "รับฟัง", "A good ear"),
    o("food_recs", "🍜", "ร้านอร่อย", "Food recommendations"),
    o("plans", "📅", "ชวนเที่ยว", "Plans"),
    o("laughs", "😂", "เสียงหัวเราะ", "Laughs"),
    o("honesty", "🪞", "ความจริงใจ", "Honesty"),
    o("calm", "🌿", "ความใจเย็น", "Calm"),
    o("hype", "📣", "กำลังใจ", "Hype"),
  ]),
  multi("bkk_neighbourhoods", "🏘️", "ย่านที่ชอบไปเดินเล่น", "Neighbourhoods I love wandering", [
    o("yaowarat", "🏮", "เยาวราช", "Yaowarat"),
    o("ari", "☕", "อารีย์", "Ari"),
    o("talat_noi", "🎨", "ตลาดน้อย", "Talat Noi"),
    o("thonglor", "🍸", "ทองหล่อ", "Thong Lo"),
    o("banglamphu", "🛕", "บางลำพู", "Banglamphu"),
    o("bang_krachao", "🚲", "บางกระเจ้า", "Bang Krachao"),
    o("chatuchak", "🛍️", "จตุจักร", "Chatuchak"),
    o("thonburi", "⛴️", "ฝั่งธนฯ", "Thonburi"),
  ]),
  multi("learn_together", "📚", "อยากเรียนอะไรกับเพื่อนใหม่", "Things I'd learn with a new friend", [
    o("cooking", "🍳", "ทำอาหารไทย", "Thai cooking"),
    o("language", "🗣️", "ภาษาใหม่", "A new language"),
    o("dance", "💃", "เต้น", "Dancing"),
    o("pottery", "🏺", "ปั้นดิน", "Pottery"),
    o("muay_thai", "🥊", "มวยไทย", "Muay Thai"),
    o("photo", "📷", "ถ่ายรูป", "Photography"),
    o("swim", "🏊", "ว่ายน้ำ", "Swimming"),
  ]),
  multi("snack_run", "🏪", "ของติดมือจากเซเว่น", "My 7-Eleven run", [
    o("toastie", "🥪", "แซนด์วิชอบ", "Toastie"),
    o("milk", "🥛", "นมเย็น", "Pink milk"),
    o("onigiri", "🍙", "ข้าวปั้น", "Onigiri"),
    o("chips", "🥔", "มันฝรั่ง", "Crisps"),
    o("icecream", "🍦", "ไอศกรีม", "Ice cream"),
    o("dumplings", "🥟", "ซาลาเปา", "Steamed buns"),
  ]),
  multi("feel_at_home", "🏡", "สิ่งที่ทำให้รู้สึกเหมือนอยู่บ้าน", "What makes a place feel like home", [
    o("smell", "🍲", "กลิ่นอาหาร", "Food smells"),
    o("plants", "🪴", "ต้นไม้", "Plants"),
    o("music", "🎶", "เพลง", "Music"),
    o("people", "👋", "คนทักทาย", "People saying hi"),
    o("quiet", "🤫", "ความเงียบ", "Quiet"),
    o("light", "☀️", "แสงแดด", "Sunlight"),
  ]),
  multi("event_vibes", "🎟️", "กิจกรรมที่อยากไปเดือนนี้", "Events I'd join this month", [
    o("run_club", "🏃", "วิ่งกลุ่ม", "Run club"),
    o("board_games", "🎲", "บอร์ดเกม", "Board games"),
    o("food_walk", "🍢", "เดินกิน", "Food walk"),
    o("volunteer", "🙌", "อาสา", "Volunteering"),
    o("workshop", "🛠️", "เวิร์กช็อป", "Workshop"),
    o("gallery", "🖼️", "แกลเลอรี", "Gallery night"),
    o("language", "🗣️", "แลกเปลี่ยนภาษา", "Language exchange"),
  ]),

  // --- photos
  photo("photo_bkk_corner", "📸", "รูปมุมโปรดในกรุงเทพฯ", "A photo of your favourite Bangkok corner"),
  photo("photo_meal", "🍜", "รูปมื้ออร่อยล่าสุด", "The last great thing you ate"),
  photo("photo_view", "🌇", "วิวจากที่ที่ชอบ", "A view you love"),
  photo("photo_made", "🎨", "สิ่งที่ทำเองกับมือ", "Something you made"),
  photo("photo_pet", "🐾", "สัตว์ที่ทำให้ยิ้ม (ของใครก็ได้)", "An animal that made you smile (anyone's)"),
  photo("photo_weekend", "🧺", "หนึ่งรูปจากสุดสัปดาห์ที่ผ่านมา", "One photo from last weekend"),
  photo("photo_shelf", "📚", "ชั้นหนังสือหรือโต๊ะทำงาน", "Your bookshelf or desk"),

  // --- one emoji (or a few)
  emoji("emoji_mood", "🙂", "อีโมจิที่บอกความเป็นฉัน", "The emoji that sums me up", "😄 😌 🤓 🥳 😎 🤗 🫠 🙃 🌞 🐢"),
  emoji("emoji_sunday", "☀️", "วันอาทิตย์ในฝันใน 3 อีโมจิ", "Ideal Sunday in 3 emojis", "☕ 🥞 📚 🧘 🚲 🌳 🛍️ 🍜 😴 🎮 🎨 🏊 🎬 🐶", 3),
  emoji("emoji_bkk", "🏙️", "กรุงเทพฯ ในหนึ่งอีโมจิ", "Bangkok in one emoji", "🛺 🌶️ 🔥 🌧️ 🏮 🚝 🍢 🐈 🛕 🌇"),
  emoji("emoji_week", "📆", "สัปดาห์นี้ในหนึ่งอีโมจิ", "This week in one emoji", "🚀 🐢 🌈 🌧️ 🎢 😴 🔥 🌱 🧃 🫡"),
  emoji("emoji_food", "🍽️", "อาหารที่เป็นตัวฉัน", "The food that is basically me", "🍜 🍕 🥭 🍣 🌮 🍩 🥟 🍙 🥗 🍲"),
  emoji("emoji_energy", "⚡", "พลังงานตอนเจอเพื่อนใหม่", "My energy meeting new people", "🔋 🪫 🌋 🌊 🌤️ 🎈 🐣 🦉"),

  // --- rank
  rank("rank_bkk_food", "🏆", "เรียงอาหารกรุงเทพฯ ที่ชอบ", "Rank these Bangkok bites", [
    o("pad_kra_pao", "🍳", "ผัดกะเพรา", "Pad kra pao"),
    o("khao_man_gai", "🍗", "ข้าวมันไก่", "Khao man gai"),
    o("boat_noodles", "🍜", "ก๋วยเตี๋ยวเรือ", "Boat noodles"),
    o("moo_ping", "🍢", "หมูปิ้ง", "Moo ping"),
  ]),
  rank("rank_weekend", "🗓️", "เรียงสิ่งที่อยากทำวันเสาร์", "Rank your Saturday", [
    o("sleep_in", "😴", "นอนตื่นสาย", "Sleep in"),
    o("explore", "🧭", "ออกสำรวจ", "Explore somewhere"),
    o("friends", "👯", "เจอเพื่อน", "See friends"),
    o("hobby", "🎨", "ทำงานอดิเรก", "A hobby"),
  ]),
  rank("rank_transport", "🚦", "เรียงวิธีเดินทางที่ชอบ", "Rank how you get around", [
    o("train", "🚝", "รถไฟฟ้า", "Skytrain/MRT"),
    o("boat", "⛴️", "เรือ", "Boat"),
    o("walk", "🚶", "เดิน", "Walking"),
    o("bike", "🚲", "จักรยาน", "Bike"),
  ]),
  rank("rank_friend_time", "⏳", "เรียงวิธีใช้เวลากับเพื่อน", "Rank your favourite friend time", [
    o("eat", "🍲", "กินข้าว", "Eating"),
    o("talk", "💬", "นั่งคุย", "Talking"),
    o("move", "🏸", "ขยับร่างกาย", "Moving"),
    o("make", "🎨", "ทำอะไรด้วยกัน", "Making something"),
  ]),
  rank("rank_seasons", "🌦️", "เรียงฤดูของกรุงเทพฯ", "Rank Bangkok's seasons", [
    o("hot", "🔥", "ร้อน", "Hot"),
    o("rainy", "🌧️", "ฝน", "Rainy"),
    o("cool", "🌬️", "หนาว (นิดนึง)", "Cool(ish)"),
  ]),
  rank("rank_desserts", "🍨", "เรียงของหวานไทย", "Rank these Thai sweets", [
    o("khanom_krok", "🥥", "ขนมครก", "Khanom krok"),
    o("lod_chong", "🟢", "ลอดช่อง", "Lod chong"),
    o("roti", "🫓", "โรตี", "Roti"),
    o("tub_tim_grob", "🍧", "ทับทิมกรอบ", "Tub tim grob"),
  ]),
];

const PROMPT_BY_ID = new Map(PROMPT_BANK.map((p) => [p.id, p]));
export function promptById(id: string): Prompt | undefined {
  return PROMPT_BY_ID.get(id);
}

// ------------------------------------------------------------- the deck --

/** Kind families a deck must mix. */
const FAMILY: Record<PromptKind, string> = {
  text: "text",
  slider: "gauge",
  scale: "gauge",
  choice: "pick",
  emoji: "pick",
  multi: "list",
  rank: "list",
  photo: "photo",
};
export const DECK_SIZE = 6;

/**
 * A member's personal prompt deck: n prompts, seeded by their account id so
 * every member gets a different (but stable) set. Always mixes kinds: at
 * least one short answer, one slider or scale, one this-or-that or emoji and
 * (when photos are allowed and n ≥ 4) one photo.
 */
export function deckFor(accountId: string, n = DECK_SIZE, opts: { photo?: boolean; exclude?: string[] } = {}): string[] {
  const rng = createRng(`deck:${accountId}`);
  const exclude = new Set(opts.exclude ?? []);
  const pool = shuffle(rng, PROMPT_BANK.filter((p) => !exclude.has(p.id) && (opts.photo !== false || p.kind !== "photo")));
  const need = ["text", "gauge", "pick", ...(opts.photo !== false && n >= 4 ? ["photo"] : [])];
  const out: Prompt[] = [];
  for (const fam of need) {
    if (out.length >= n) break;
    const p = pool.find((x) => FAMILY[x.kind] === fam && !out.includes(x));
    if (p) out.push(p);
  }
  // Fill the rest, at most two of any family so a deck never feels samey.
  const famCount = (f: string) => out.filter((x) => FAMILY[x.kind] === f).length;
  for (const p of pool) {
    if (out.length >= n) break;
    if (!out.includes(p) && famCount(FAMILY[p.kind]) < 2) out.push(p);
  }
  for (const p of pool) {
    if (out.length >= n) break;
    if (!out.includes(p)) out.push(p);
  }
  return shuffle(rng, out).map((p) => p.id);
}

/** The stored deck, cleaned (unknown ids dropped, de-duplicated), or a fresh one. */
export function currentDeck(accountId: string, bio: Bio | null | undefined): string[] {
  const stored = (bio?.deck ?? []).filter((id, i, a) => PROMPT_BY_ID.has(id) && a.indexOf(id) === i);
  return stored.length ? stored : deckFor(accountId);
}

/**
 * Swap one prompt for an unused one, preferring the same kind family so the
 * mix survives. `seen` lists prompts to avoid (e.g. ones already swapped
 * away). Returns the same deck if the id isn't in it.
 */
export function swapPrompt(deck: string[], promptId: string, rnd: () => number = Math.random, seen: string[] = []): string[] {
  const i = deck.indexOf(promptId);
  const old = PROMPT_BY_ID.get(promptId);
  if (i < 0 || !old) return deck;
  const used = new Set([...deck, ...seen]);
  let pool = PROMPT_BANK.filter((p) => !used.has(p.id) && FAMILY[p.kind] === FAMILY[old.kind]);
  if (pool.length === 0) pool = PROMPT_BANK.filter((p) => !deck.includes(p.id) && p.id !== promptId);
  if (pool.length === 0) return deck;
  const next = pool[Math.floor(rnd() * pool.length) % pool.length];
  const out = deck.slice();
  out[i] = next.id;
  return out;
}

// -------------------------------------------------------------- the bio --

export type Answer = { kind: string; value: string | number | string[]; photoKey?: string };
export type Bio = {
  comm?: string[];
  headline?: string;
  /** A value from OCCUPATIONS; "other" goes with occupationOther. */
  occupation?: string;
  occupationOther?: string;
  learning?: string;
  learningLangs?: string[];
  energy?: string;
  weekend?: string;
  deck?: string[];
  /** Prompts swapped away, so shuffling doesn't bring them straight back. */
  skipped?: string[];
  answers?: Record<string, Answer>;
};

// ---------------------------------------------------------- validation --

export type Check<T> = { ok: true; value: T } | { ok: false; error: L2 };
const bad = (th: string, en: string): { ok: false; error: L2 } => ({ ok: false, error: { th, en } });

/**
 * Validate one raw form answer for a prompt. `raw` is the posted value(s);
 * empty means "not answered" (ok, value null). Photo prompts validate the
 * caption here; the file itself is checked by the route.
 */
export function validateAnswer(p: Prompt, raw: string | string[] | undefined): Check<string | number | string[] | null> {
  const vals = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map((x) => x.trim()).filter(Boolean);
  if (p.kind === "rank") return validateRank(p, vals);
  if (vals.length === 0) return { ok: true, value: null };
  const optValues = (p.options ?? []).map((x) => x.value);
  switch (p.kind) {
    case "text":
      if (vals[0].length > TEXT_MAX) return bad(`คำตอบยาวได้ไม่เกิน ${TEXT_MAX} ตัวอักษร`, `Answers can be at most ${TEXT_MAX} characters.`);
      return { ok: true, value: vals[0] };
    case "photo":
      if (vals[0].length > CAPTION_MAX) return bad(`คำบรรยายรูปยาวได้ไม่เกิน ${CAPTION_MAX} ตัวอักษร`, `Captions can be at most ${CAPTION_MAX} characters.`);
      return { ok: true, value: vals[0] };
    case "slider":
    case "scale": {
      const n = Number(vals[0]);
      const min = p.min ?? 1;
      const max = p.max ?? 5;
      const step = p.step ?? 1;
      if (!Number.isFinite(n) || n < min || n > max || Math.abs((n - min) / step - Math.round((n - min) / step)) > 1e-9) {
        return bad("ค่าที่เลือกไม่ถูกต้อง", "That value isn't on the scale.");
      }
      return { ok: true, value: n };
    }
    case "choice":
      if (vals.length !== 1 || !optValues.includes(vals[0])) return bad("ตัวเลือกไม่ถูกต้อง", "Please pick one of the options.");
      return { ok: true, value: vals[0] };
    case "emoji":
    case "multi": {
      const pick = p.pick ?? (p.kind === "multi" ? 3 : 1);
      if (vals.some((v) => !optValues.includes(v))) return bad("ตัวเลือกไม่ถูกต้อง", "Please pick from the options.");
      const uniq = [...new Set(vals)];
      if (uniq.length > pick) return bad(`เลือกได้ไม่เกิน ${pick}`, `Pick at most ${pick}.`);
      return { ok: true, value: p.kind === "emoji" && pick === 1 ? uniq[0] : uniq };
    }
  }
  return bad("ตัวเลือกไม่ถูกต้อง", "Invalid answer.");
}

/** Rank: `vals` are the item values in order (1st, 2nd, ...). All or nothing. */
function validateRank(p: Prompt, vals: string[]): Check<string[] | null> {
  if (vals.length === 0) return { ok: true, value: null };
  const optValues = (p.options ?? []).map((x) => x.value);
  const uniq = new Set(vals);
  if (vals.length !== optValues.length || uniq.size !== vals.length || vals.some((v) => !optValues.includes(v))) {
    return bad("ให้อันดับไม่ซ้ำกันครบทุกข้อ", "Give every item a different place.");
  }
  return { ok: true, value: vals };
}

/** Rank from per-item positions ({item: "1".."n"}) to an ordered list; empty when nothing set. */
export function rankFromPositions(p: Prompt, positions: Record<string, string>): string[] | "partial" {
  const items = (p.options ?? []).map((x) => x.value);
  const set = items.filter((v) => positions[v]);
  if (set.length === 0) return [];
  if (set.length !== items.length) return "partial";
  const sorted = items.slice().sort((a, b) => Number(positions[a]) - Number(positions[b]));
  const nums = items.map((v) => Number(positions[v]));
  if (new Set(nums).size !== items.length || nums.some((n) => !Number.isInteger(n) || n < 1 || n > items.length)) return "partial";
  return sorted;
}

/** Keep only well-formed fields of a stored bio (jsonb from the database). */
export function cleanBio(raw: unknown): Bio {
  if (!raw || typeof raw !== "object") return {};
  const b = raw as Record<string, unknown>;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
  const s = (v: unknown) => (typeof v === "string" ? v : undefined);
  const out: Bio = {};
  if (strs(b.comm)) out.comm = strs(b.comm);
  if (s(b.headline)) out.headline = s(b.headline);
  if (s(b.occupation)) out.occupation = s(b.occupation);
  if (s(b.occupationOther)) out.occupationOther = s(b.occupationOther);
  if (s(b.learning)) out.learning = s(b.learning);
  if (strs(b.learningLangs)) out.learningLangs = strs(b.learningLangs);
  if (s(b.energy)) out.energy = s(b.energy);
  if (s(b.weekend)) out.weekend = s(b.weekend);
  if (strs(b.deck)) out.deck = strs(b.deck);
  if (strs(b.skipped)) out.skipped = strs(b.skipped);
  if (b.answers && typeof b.answers === "object") out.answers = b.answers as Record<string, Answer>;
  return out;
}

export function optLabel(list: Opt[], value: string | undefined | null, lang: "th" | "en"): string {
  const x = list.find((i) => i.value === value);
  return x ? `${x.emoji} ${lang === "en" ? x.en : x.th}` : "";
}
