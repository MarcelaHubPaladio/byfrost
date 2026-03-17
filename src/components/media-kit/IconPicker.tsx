import { useState, useMemo } from "react";
import * as LucideIcons from "lucide-react";
import * as FaIcons from "react-icons/fa6";
import * as MdIcons from "react-icons/md";
import * as IoIcons from "react-icons/io5";
import { Search, Palette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Common Lucide Icons
const LUCIDE_COMMON = [
  "Home", "User", "Settings", "Mail", "Phone", "Calendar", "MapPin", "Clock", "Info",
  "Heart", "Star", "Check", "Plus", "ArrowRight", "ChevronRight", "Search", "Trash2",
  "Edit2", "Download", "Upload", "ExternalLink", "MessageSquare", "Facebook", "Instagram",
  "Twitter", "Youtube", "Linkedin", "Github", "Award", "Book", "Briefcase", "Car",
  "Coffee", "Globe", "Music", "Tv", "Wifi", "Wind", "Sun", "Moon", "Cloud", "Umbrella",
  "Zap", "Target", "Shield", "Rocket", "Lightbulb", "Key", "Flame", "Fingerprint",
  "Compass", "Anchor", "Activity", "Trees", "CloudRain", "Snowflake", "Mountain",
  "Waves", "Palette", "Layout", "PieChart", "BarChart", "LineChart", "TrendingUp",
  "Cpu", "Database", "Terminal", "Code", "Smartphone", "Tablet", "Laptop", "Monitor",
  "Headphones", "Mic", "Speaker", "Volume2", "Video", "Scissors", "PenTool", "Sticker",
  "Brush", "Eraser", "Printer", "Copy", "Utensils", "GlassWater", "Beer", "Pizza",
  "Apple", "Fish", "Bird", "Cat", "Dog", "Feather", "Flower", "Leaf", "Timer", "Trophy", 
  "Medal", "Users", "Building", "Store", "Warehouse", "Factory", "HardHat", "Truck", 
  "Plane", "Ship", "Train", "Bike", "Navigation", "Flag", "Map", "Milestone", "Pin", 
  "Tag", "Tickets", "Coins", "Wallet", "Calculator", "Table", "Files", "FileText", 
  "FileImage", "FileVideo", "FileAudio", "Folder", "Archive", "CloudUpload", "CloudDownload"
];

// Common FontAwesome Icons (FA6)
const FA_COMMON = [
  "FaHouse", "FaUser", "FaGear", "FaEnvelope", "FaPhone", "FaCalendarDays", "FaLocationDot", "FaClock", "FaCircleInfo",
  "FaHeart", "FaStar", "FaCheck", "FaPlus", "FaArrowRight", "FaChevronRight", "FaMagnifyingGlass", "FaTrashCan",
  "FaPenToSquare", "FaArrowDown", "FaArrowUp", "FaShareNodes", "FaLock", "FaEye", "FaCamera", "FaLayerGroup",
  "FaBagShopping", "FaCreditCard", "FaGift", "FaBell", "FaComment", "FaFacebook", "FaInstagram", "FaTwitter",
  "FaYoutube", "FaLinkedin", "FaGithub", "FaAward", "FaBook", "FaBriefcase", "FaCar", "FaCoffee", "FaGlobe",
  "FaMusic", "FaTv", "FaWifi", "FaWind", "FaSun", "FaMoon", "FaCloud", "FaUmbrella", "FaBolt", "FaCrosshairs"
];

// Common Material Design Icons (MD)
const MD_COMMON = [
  "MdHome", "MdPerson", "MdSettings", "MdEmail", "MdPhone", "MdEvent", "MdLocationOn", "MdSchedule", "MdInfo",
  "MdFavorite", "MdStar", "MdCheck", "MdAdd", "MdArrowForward", "MdChevronRight", "MdSearch", "MdDelete",
  "MdEdit", "MdDownload", "MdUpload", "MdLaunch", "MdChat", "MdCloud", "MdWbSunny", "MdNightlight", "MdFlashOn",
  "MdNotifications", "MdShoppingCart", "MdPayment", "MdLock", "MdVisibility", "MdPhotoCamera", "MdLayers",
  "MdWork", "MdDirectionsCar", "MdLocalCoffee", "MdPublic", "MdMusicNote", "MdTv", "MdWifi", "MdDirections"
];

// Common Ionicons (IO5)
const IO_COMMON = [
  "IoHomeOutline", "IoPersonOutline", "IoSettingsOutline", "IoMailOutline", "IoCallOutline", "IoCalendarOutline", "IoLocationOutline", "IoTimeOutline", "IoInformationCircleOutline",
  "IoHeartOutline", "IoStarOutline", "IoCheckmarkOutline", "IoAddOutline", "IoArrowForwardOutline", "IoChevronForwardOutline", "IoSearchOutline", "IoTrashOutline",
  "IoCreateOutline", "IoDownloadOutline", "IoUploadOutline", "IoShareSocialOutline", "IoLockClosedOutline", "IoEyeOutline", "IoCameraOutline", "IoLayersOutline",
  "IoBriefcaseOutline", "IoCarOutline", "IoCafeOutline", "IoEarthOutline", "IoMusicalNotesOutline", "IoTvOutline", "IoWifiOutline", "IoSunnyOutline", "IoMoonOutline"
];

interface IconPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (iconName: string, library?: string) => void;
}

export function IconPicker({ open, onOpenChange, onSelect }: IconPickerProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("lucide");

  const getFilteredIcons = (icons: string[]) => 
    icons.filter(name => name.toLowerCase().includes(search.toLowerCase()));

  const lucideIcons = useMemo(() => getFilteredIcons(LUCIDE_COMMON), [search]);
  const faIcons = useMemo(() => getFilteredIcons(FA_COMMON), [search]);
  const mdIcons = useMemo(() => getFilteredIcons(MD_COMMON), [search]);
  const ioIcons = useMemo(() => getFilteredIcons(IO_COMMON), [search]);

  const renderIconGrid = (icons: string[], IconsLib: any, libName: string) => (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
      {icons.map(name => {
        const IconComponent = IconsLib[name];
        if (!IconComponent) return null;
        
        return (
          <Button
            key={name}
            variant="outline"
            className="h-16 flex flex-col gap-2 rounded-xl border-slate-100 hover:border-indigo-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all p-2"
            onClick={() => {
              // For react-icons, we persist the name which includes the prefix (e.g. FaHouse)
              // The renderer must be updated to handle these.
              onSelect(name, libName);
              onOpenChange(false);
            }}
          >
            <IconComponent className="w-6 h-6" />
            <span className="text-[10px] truncate w-full">{name}</span>
          </Button>
        );
      })}
      {icons.length === 0 && (
        <div className="col-span-full py-12 text-center text-slate-400 italic">
          Nenhum ícone encontrado para "{search}"
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Palette className="w-5 h-5 text-indigo-600" />
            Biblioteca de Ícones
          </DialogTitle>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Buscar ícone..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl bg-slate-50 border-slate-200"
            />
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden px-6 pb-6 mt-4">
          <TabsList className="grid grid-cols-4 w-full h-12 p-1 bg-slate-100/50 rounded-xl mb-4">
            <TabsTrigger value="lucide" className="rounded-lg text-xs font-semibold">Lucide</TabsTrigger>
            <TabsTrigger value="fa" className="rounded-lg text-xs font-semibold">FontAwesome</TabsTrigger>
            <TabsTrigger value="md" className="rounded-lg text-xs font-semibold">Material</TabsTrigger>
            <TabsTrigger value="io" className="rounded-lg text-xs font-semibold">Ionicons</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <TabsContent value="lucide" className="m-0 focus-visible:outline-none">
              {renderIconGrid(lucideIcons, LucideIcons, "lucide")}
            </TabsContent>
            <TabsContent value="fa" className="m-0 focus-visible:outline-none">
              {renderIconGrid(faIcons, FaIcons, "fa")}
            </TabsContent>
            <TabsContent value="md" className="m-0 focus-visible:outline-none">
              {renderIconGrid(mdIcons, MdIcons, "md")}
            </TabsContent>
            <TabsContent value="io" className="m-0 focus-visible:outline-none">
              {renderIconGrid(ioIcons, IoIcons, "io")}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
