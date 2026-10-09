export const latinToCyrillic = (text: string): string => {
    const singleMapping: Record<string, string> = {
        'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е', 'z': 'з', 'i': 'и', 'j': 'й',
        'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'f': 'ф',
        'h': 'х', 'c': 'ц', 'y': 'у',
        'A': 'А', 'B': 'Б', 'V': 'В', 'G': 'Г', 'D': 'Д', 'E': 'Е', 'Z': 'З', 'I': 'И', 'J': 'Й',
        'K': 'К', 'L': 'Л', 'M': 'М', 'N': 'Н', 'O': 'О', 'P': 'П', 'R': 'Р', 'S': 'С', 'T': 'Т', 'U': 'У', 'F': 'Ф',
        'H': 'Х', 'C': 'Ц', 'Y': 'У'
    };

    let result = text.toLowerCase();
    
    result = result.replace(/shch/g, 'щ');
    result = result.replace(/sh/g, 'ш');
    result = result.replace(/ch/g, 'ч');
    result = result.replace(/kh/g, 'х');
    result = result.replace(/ts/g, 'ц');
    result = result.replace(/yu/g, 'ю');
    result = result.replace(/ya/g, 'я');
    result = result.replace(/yo/g, 'ё');
    result = result.replace(/zh/g, 'ж');
    
    for (const [latin, cyrillic] of Object.entries(singleMapping)) {
        result = result.split(latin).join(cyrillic);
    }
    
    return result.charAt(0).toUpperCase() + result.slice(1);
};

export const cyrillicToLatin = (text: string): string => {
    const mapping: Record<string, string> = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j',
        'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
        'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'J',
        'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F',
        'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    };

    let result = text;
    
    for (const [cyrillic, latin] of Object.entries(mapping)) {
        result = result.split(cyrillic).join(latin);
    }
    
    return result;
};

export const generateTransliterations = (text: string): string[] => {
    const variants: string[] = [text];
    
    const transliterated = latinToCyrillic(text);
    if (transliterated !== text) {
        variants.push(transliterated);
    }
    
    return variants;
};
