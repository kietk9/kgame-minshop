import masterGeo from './vietnamGeoMaster.json';
import wardMergerMapRaw from './vietnamWardMergerMap.json';

// Bảng tra cứu sáp nhập 10.603 phường/xã toàn quốc: [Tên mới, Tỉnh mới, Tên cũ chuẩn]
export const WARD_MERGER_MAP: Record<string, [string, string, string]> = {};
for (const [key, values] of Object.entries(wardMergerMapRaw)) {
  if (values.length !== 3 || values.some(value => typeof value !== 'string')) {
    throw new Error(`Invalid ward merger entry: ${key}`);
  }
  WARD_MERGER_MAP[key] = [values[0], values[1], values[2]];
}

export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function cleanDistrictPrefix(str: string): string {
  return removeVietnameseAccents(str)
    .replace(/^(huyen|quan|thi xa|thanh pho|tp\.?|tx\.?|h\.?|q\.?)\s+/i, '')
    .trim();
}

export function cleanWardPrefix(str: string): string {
  return removeVietnameseAccents(str)
    .replace(/^(phuong|xa|thi tran|tt\.?|p\.?|x\.?)\s+/i, '')
    .trim();
}

export function cleanProvincePrefix(str: string): string {
  return removeVietnameseAccents(str)
    .replace(/^(tinh|thanh pho|tp\.?)\s+/i, '')
    .trim();
}

export function isWardPrefix(norm: string): boolean {
  return /^(phuong|xa|thi tran|tt\.?|p\.?|x\.?)\s+/i.test(norm);
}

export function isDistrictPrefix(norm: string): boolean {
  return /^(huyen|quan|thi xa|tx\.?|h\.?|q\.?)\s+/i.test(norm);
}

// 34 Tỉnh / Thành phố trực thuộc Trung ương chính thức
export const VIETNAM_PROVINCES: string[] = masterGeo.provinces;

// Toàn bộ 3.319 Phường / Xã mới theo từng tỉnh thành
export const POPULAR_WARDS_BY_PROVINCE: Record<string, string[]> = masterGeo.wards_by_province;

// Bảng ánh xạ 680 Quận / Huyện cũ ➔ Tỉnh / TP mới
export const OLD_DISTRICT_TO_PROVINCE: Record<string, string> = masterGeo.district_to_province;

// Bản đồ quy đổi sáp nhập cấp tỉnh cũ ➔ Tỉnh mới
export const PROVINCE_MERGER_MAP: Record<string, string> = {
  // Ninh Thuận sáp nhập vào Khánh Hòa
  'ninh thuận': 'Tỉnh Khánh Hòa',
  'ninh thuan': 'Tỉnh Khánh Hòa',

  // Bến Tre, Trà Vinh sáp nhập vào Vĩnh Long
  'bến tre': 'Tỉnh Vĩnh Long',
  'ben tre': 'Tỉnh Vĩnh Long',
  'trà vinh': 'Tỉnh Vĩnh Long',
  'tra vinh': 'Tỉnh Vĩnh Long',

  // Bình Phước sáp nhập vào Đồng Nai
  'bình phước': 'Tỉnh Đồng Nai',
  'binh phuoc': 'Tỉnh Đồng Nai',

  // Long An sáp nhập vào Tây Ninh
  'long an': 'Tỉnh Tây Ninh',

  // Tiền Giang sáp nhập vào Đồng Tháp
  'tiền giang': 'Tỉnh Đồng Tháp',
  'tien giang': 'Tỉnh Đồng Tháp',

  // Bạc Liêu sáp nhập vào Cà Mau
  'bạc liêu': 'Tỉnh Cà Mau',
  'bac lieu': 'Tỉnh Cà Mau',

  // Kiên Giang sáp nhập vào An Giang
  'kiên giang': 'Tỉnh An Giang',
  'kien giang': 'Tỉnh An Giang',

  // Sóc Trăng, Hậu Giang sáp nhập vào TP. Cần Thơ
  'sóc trăng': 'Tp Cần Thơ',
  'soc trang': 'Tp Cần Thơ',
  'hậu giang': 'Tp Cần Thơ',
  'hau giang': 'Tp Cần Thơ',

  // Bình Dương, Bà Rịa - Vũng Tàu sáp nhập vào TP. Hồ Chí Minh
  'bình dương': 'Tp Hồ Chí Minh',
  'binh duong': 'Tp Hồ Chí Minh',
  'bà rịa - vũng tàu': 'Tp Hồ Chí Minh',
  'bà rịa vũng tàu': 'Tp Hồ Chí Minh',
  'vũng tàu': 'Tp Hồ Chí Minh',
  'brvt': 'Tp Hồ Chí Minh',

  // Đắk Nông, Bình Thuận sáp nhập vào Lâm Đồng
  'đắk nông': 'Tỉnh Lâm Đồng',
  'dak nong': 'Tỉnh Lâm Đồng',
  'bình thuận': 'Tỉnh Lâm Đồng',
  'binh thuan': 'Tỉnh Lâm Đồng',

  // Kon Tum sáp nhập vào Quảng Ngãi
  'kon tum': 'Tỉnh Quảng Ngãi',

  // Bình Định sáp nhập vào Gia Lai
  'bình định': 'Tỉnh Gia Lai',
  'binh dinh': 'Tỉnh Gia Lai',

  // Quảng Nam sáp nhập vào TP. Đà Nẵng
  'quảng nam': 'Tp Đà Nẵng',
  'quang nam': 'Tp Đà Nẵng',

  // Quảng Bình sáp nhập vào Quảng Trị
  'quảng bình': 'Tỉnh Quảng Trị',
  'quang binh': 'Tỉnh Quảng Trị',

  // Phú Yên sáp nhập vào Đắk Lắk
  'phú yên': 'Tỉnh Đắk Lắk',
  'phu yen': 'Tỉnh Đắk Lắk',

  // Hà Nam, Nam Định sáp nhập vào Ninh Bình
  'hà nam': 'Tỉnh Ninh Bình',
  'ha nam': 'Tỉnh Ninh Bình',
  'nam định': 'Tỉnh Ninh Bình',
  'nam dinh': 'Tỉnh Ninh Bình',

  // Hải Dương sáp nhập vào Hải Phòng
  'hải dương': 'Tp Hải Phòng',
  'hai duong': 'Tp Hải Phòng',

  // Thái Bình sáp nhập vào Hưng Yên
  'thái bình': 'Tỉnh Hưng Yên',
  'thai binh': 'Tỉnh Hưng Yên',

  // Bắc Giang sáp nhập vào Bắc Ninh
  'bắc giang': 'Tỉnh Bắc Ninh',
  'bac giang': 'Tỉnh Bắc Ninh',

  // Hòa Bình, Vĩnh Phúc sáp nhập vào Phú Thọ
  'hòa bình': 'Tỉnh Phú Thọ',
  'hoa binh': 'Tỉnh Phú Thọ',
  'vĩnh phúc': 'Tỉnh Phú Thọ',
  'vinh phuc': 'Tỉnh Phú Thọ',

  // Bắc Kạn sáp nhập vào Thái Nguyên
  'bắc kạn': 'Tỉnh Thái Nguyên',
  'bac kan': 'Tỉnh Thái Nguyên',

  // Hà Giang sáp nhập vào Tuyên Quang
  'hà giang': 'Tỉnh Tuyên Quang',
  'ha giang': 'Tỉnh Tuyên Quang',

  // Yên Bái sáp nhập vào Lào Cai
  'yên bái': 'Tỉnh Lào Cai',
  'yen bai': 'Tỉnh Lào Cai',
};

// Tìm kiếm Tỉnh / Thành phố hỗ trợ gõ không dấu và bỏ qua tiền tố "Tỉnh / TP / Thành phố"
export function searchProvinces(query: string): string[] {
  const cleanQ = removeVietnameseAccents(query);
  if (!cleanQ) return VIETNAM_PROVINCES.slice(0, 15);

  return VIETNAM_PROVINCES.filter((p) => {
    const cleanP = removeVietnameseAccents(p);
    const cleanShort = cleanP.replace(/^(tinh|thanh pho|tp\.?)\s+/i, '');
    return cleanP.includes(cleanQ) || cleanShort.includes(cleanQ) || (cleanQ.length <= 4 && getAcronym(p).includes(cleanQ));
  });
}

// Tìm kiếm Phường / Xã thuộc Tỉnh (tra cứu từ danh bạ 3.319 phường/xã của BNV)
export function searchWards(province: string, query: string): string[] {
  let wards = POPULAR_WARDS_BY_PROVINCE[province] || [];
  if (!wards || wards.length === 0) {
    const normTarget = removeVietnameseAccents(province).replace(/^(tinh|thanh pho|tp\.?)\s+/i, '').trim();
    for (const [p, wList] of Object.entries(POPULAR_WARDS_BY_PROVINCE)) {
      const normP = removeVietnameseAccents(p).replace(/^(tinh|thanh pho|tp\.?)\s+/i, '').trim();
      if (normTarget === normP || normP.includes(normTarget) || normTarget.includes(normP)) {
        wards = wList;
        break;
      }
    }
  }

  const cleanQ = removeVietnameseAccents(query);
  if (!cleanQ) {
    return (wards || []).slice(0, 25);
  }

  return (wards || []).filter((w) => {
    const cleanW = removeVietnameseAccents(w);
    return cleanW.includes(cleanQ) || getAcronym(w).includes(cleanQ);
  });
}

function getAcronym(str: string): string {
  return removeVietnameseAccents(str)
    .split(/\s+/)
    .map((word) => word[0])
    .join('');
}

export interface ParsedAddress {
  raw: string;
  province: string;
  ward: string;
  detail: string;
  converted_from?: string;
}

// Bóc tách thông minh từ chuỗi địa chỉ đầy đủ thành Tỉnh, Phường/Xã và Số nhà
// Tự động đối chiếu bản đồ sáp nhập địa giới hành chính năm 2025
export function parseVietnameseAddress(raw: string): ParsedAddress {
  if (!raw || typeof raw !== 'string') {
    return { raw: raw || '', province: '', ward: '', detail: '' };
  }

  const text = raw.trim();
  const cleanText = text.replace(/[\r\n]+/g, ', ');
  const parts = cleanText.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);

  let detectedProvince = '';
  let foundDistrictKey = '';
  let foundDistrictName = '';
  const matchedIndices = new Set<number>();
  let convertedFrom: string | undefined = undefined;

  // 1. Quét Quận / Huyện cũ (Bỏ qua các mục có tiền tố Phường/Xã/Thị trấn)
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const normP = removeVietnameseAccents(p);
    if (isWardPrefix(normP)) continue;

    const cleanD = cleanDistrictPrefix(p);

    for (const [dist, prov] of Object.entries(OLD_DISTRICT_TO_PROVINCE)) {
      const normDist = removeVietnameseAccents(dist);
      const cleanDist = cleanDistrictPrefix(dist);
      if (normDist === normP || cleanDist === cleanD) {
        if (!detectedProvince) detectedProvince = prov;
        foundDistrictKey = normDist;
        foundDistrictName = dist;
        matchedIndices.add(i);
        break;
      }
    }
  }

  // 2. Quét Tỉnh cũ hoặc Tỉnh mới
  for (let i = parts.length - 1; i >= 0; i--) {
    if (matchedIndices.has(i)) continue;
    const p = parts[i];
    const normP = removeVietnameseAccents(p);
    const cleanP = cleanProvincePrefix(p);

    if (PROVINCE_MERGER_MAP[normP] || PROVINCE_MERGER_MAP[cleanP]) {
      const prov = PROVINCE_MERGER_MAP[normP] || PROVINCE_MERGER_MAP[cleanP];
      if (!detectedProvince) detectedProvince = prov;
      matchedIndices.add(i);
      continue;
    }

    for (const prov of VIETNAM_PROVINCES) {
      const normProv = removeVietnameseAccents(prov);
      const cleanProv = cleanProvincePrefix(prov);
      if (normProv === normP || cleanProv === cleanP || normP.includes(cleanProv)) {
        if (!detectedProvince) detectedProvince = prov;
        matchedIndices.add(i);
        break;
      }
    }
  }

  // 3. Quét Phường / Xã đối chiếu qua Bảng sáp nhập 10.603 đơn vị hành chính
  let detectedWard = '';

  for (let i = parts.length - 1; i >= 0; i--) {
    if (matchedIndices.has(i)) continue;
    const p = parts[i];
    const normP = removeVietnameseAccents(p);
    const cleanW = cleanWardPrefix(p);

    let match: [string, string, string] | null = null;

    // Ưu tiên 1: Khớp chính xác cụm [Phường/Xã + Quận/Huyện cũ]
    if (foundDistrictKey) {
      match = WARD_MERGER_MAP[`${normP}|${foundDistrictKey}`] ||
              WARD_MERGER_MAP[`xa ${cleanW}|${foundDistrictKey}`] ||
              WARD_MERGER_MAP[`phuong ${cleanW}|${foundDistrictKey}`] ||
              WARD_MERGER_MAP[`thi tran ${cleanW}|${foundDistrictKey}`];
    }

    // Ưu tiên 2: Khớp tên xã kèm Tỉnh đã nhận diện
    if (!match && detectedProvince) {
      for (const [k, v] of Object.entries(WARD_MERGER_MAP)) {
        const kPrefix = k.split('|')[0];
        if (kPrefix === normP && v[1] === detectedProvince) {
          match = v;
          break;
        }
      }
      if (!match) {
        const candidates = [`thi tran ${cleanW}`, `phuong ${cleanW}`, `xa ${cleanW}`];
        for (const [k, v] of Object.entries(WARD_MERGER_MAP)) {
          const kPrefix = k.split('|')[0];
          if (candidates.includes(kPrefix) && v[1] === detectedProvince) {
            match = v;
            break;
          }
        }
      }
    }

    // Ưu tiên 3: Tra cứu theo tên đơn vị
    if (!match) {
      const candidates = [normP, `thi tran ${cleanW}`, `phuong ${cleanW}`, `xa ${cleanW}`];
      for (const c of candidates) {
        if (WARD_MERGER_MAP[c]) {
          match = WARD_MERGER_MAP[c];
          break;
        }
      }
    }

    if (match) {
      detectedWard = match[0];
      if (!detectedProvince) detectedProvince = match[1];
      matchedIndices.add(i);

      if (removeVietnameseAccents(match[2]) !== removeVietnameseAccents(match[0])) {
        convertedFrom = `${match[2]} ➔ ${match[0]}`;
      } else if (foundDistrictName) {
        convertedFrom = `${match[0]} (${foundDistrictName})`;
      }
      break;
    }
  }

  // 4. Nếu chưa có trong bảng sáp nhập, đối chiếu danh bạ 3.319 phường/xã mới của tỉnh
  if (!detectedWard && detectedProvince) {
    const wardsList = POPULAR_WARDS_BY_PROVINCE[detectedProvince] || [];
    for (let i = parts.length - 1; i >= 0; i--) {
      if (matchedIndices.has(i)) continue;
      const p = parts[i];
      const normP = removeVietnameseAccents(p);
      const cleanW = cleanWardPrefix(p);

      const found = wardsList.find(w => {
        const normW = removeVietnameseAccents(w);
        const cleanW2 = cleanWardPrefix(w);
        return normW === normP || cleanW2 === cleanW || normW.includes(cleanW);
      });

      if (found) {
        detectedWard = found;
        matchedIndices.add(i);
        break;
      }
    }
  }

  // 5. Fallback nếu vẫn chưa tìm thấy nhưng có từ khóa chỉ phường/xã
  if (!detectedWard) {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (matchedIndices.has(i)) continue;
      const p = parts[i];
      if (/^(phường|xã|thị\s*trấn|p\.|p\s+|x\.|tt\.)/i.test(p)) {
        let cleaned = p;
        if (/^p[\.\s]/i.test(cleaned)) cleaned = cleaned.replace(/^p[\.\s]+/i, 'Phường ');
        if (/^x[\.\s]/i.test(cleaned)) cleaned = cleaned.replace(/^x[\.\s]+/i, 'Xã ');
        if (/^tt[\.\s]/i.test(cleaned)) cleaned = cleaned.replace(/^tt[\.\s]+/i, 'Thị trấn ');
        detectedWard = cleaned;
        matchedIndices.add(i);
        break;
      }
    }
  }

  // Bóc tách phần còn lại thành Số nhà / Đường phố
  const detailParts = parts.filter((_, idx) => !matchedIndices.has(idx));
  let detectedDetail = detailParts.join(', ').replace(/^[, -]+|[, -]+$/g, '').trim();

  return {
    raw: text,
    province: detectedProvince,
    ward: detectedWard,
    detail: detectedDetail,
    converted_from: convertedFrom
  };
}
