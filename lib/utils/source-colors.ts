export const sourceColors = {
  'はてなブックマーク': {
    primary: '#00A4E4',
    secondary: '#E6F4FA',
    accent: '#0080C0',
    gradient: 'from-blue-400 to-blue-600',
    border: 'border-l-4 border-l-blue-500',
    hover: 'hover:shadow-blue-200',
    tag: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  },
  'Qiita': {
    primary: '#55C500',
    secondary: '#F0F9E8',
    accent: '#40A000',
    gradient: 'from-green-400 to-green-600',
    border: 'border-l-4 border-l-green-500',
    hover: 'hover:shadow-green-200',
    tag: 'bg-green-100 text-green-800 hover:bg-green-200',
  },
  'Zenn': {
    primary: '#3EA8FF',
    secondary: '#EBF8FF',
    accent: '#0080D6',
    gradient: 'from-sky-400 to-sky-600',
    border: 'border-l-4 border-l-sky-500',
    hover: 'hover:shadow-sky-200',
    tag: 'bg-sky-100 text-sky-800 hover:bg-sky-200',
  },
  'Dev.to': {
    primary: '#0A0A0A',
    secondary: '#F5F5F5',
    accent: '#3B49DF',
    gradient: 'from-indigo-400 to-indigo-600',
    border: 'border-l-4 border-l-indigo-500',
    hover: 'hover:shadow-indigo-200',
    tag: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
  },
  'TechCrunch': {
    primary: '#00D301',
    secondary: '#E8F5E8',
    accent: '#00A301',
    gradient: 'from-lime-400 to-lime-600',
    border: 'border-l-4 border-l-lime-500',
    hover: 'hover:shadow-lime-200',
    tag: 'bg-lime-100 text-lime-800 hover:bg-lime-200',
  },
  'Publickey': {
    primary: '#FF6B35',
    secondary: '#FFF4F0',
    accent: '#E55100',
    gradient: 'from-orange-400 to-orange-600',
    border: 'border-l-4 border-l-orange-500',
    hover: 'hover:shadow-orange-200',
    tag: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
  },
  'connpass': {
    primary: '#F85A40',
    secondary: '#FFF5F3',
    accent: '#E04226',
    gradient: 'from-red-400 to-red-600',
    border: 'border-l-4 border-l-red-500',
    hover: 'hover:shadow-red-200',
    tag: 'bg-red-100 text-red-800 hover:bg-red-200',
  },
  'Stack Overflow Blog': {
    primary: '#F48024',
    secondary: '#FFF8F0',
    accent: '#DA670B',
    gradient: 'from-amber-400 to-amber-600',
    border: 'border-l-4 border-l-amber-500',
    hover: 'hover:shadow-amber-200',
    tag: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  },
  'InfoQ Japan': {
    primary: '#5C9FD8',
    secondary: '#F0F7FC',
    accent: '#4080B8',
    gradient: 'from-blue-400 to-blue-600',
    border: 'border-l-4 border-l-blue-500',
    hover: 'hover:shadow-blue-200',
    tag: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  },
  'Think IT': {
    primary: '#7C4DFF',
    secondary: '#F3EFFF',
    accent: '#6234E6',
    gradient: 'from-purple-400 to-purple-600',
    border: 'border-l-4 border-l-purple-500',
    hover: 'hover:shadow-purple-200',
    tag: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
  },
  'Speaker Deck': {
    primary: '#009287',
    secondary: '#E6F5F4',
    accent: '#007268',
    gradient: 'from-teal-400 to-teal-600',
    border: 'border-l-4 border-l-teal-500',
    hover: 'hover:shadow-teal-200',
    tag: 'bg-teal-100 text-teal-800 hover:bg-teal-200',
  },
} as const;

export type SourceName = keyof typeof sourceColors;

export function getSourceColor(sourceName: string) {
  // 新しいカラーテーマ形式
  const newColorTheme = {
    gradient: 'from-gray-400 to-gray-600',
    border: 'border-gray-200',
    hover: 'hover:border-gray-400',
    tag: 'bg-gray-50 text-gray-700',
    dot: 'bg-gray-500',
    bar: 'bg-gray-500',
  };

  const sourceTheme = sourceColors[sourceName as SourceName];
  if (!sourceTheme) return newColorTheme;

  // 既存のカラー形式を新形式に変換
  if ('gradient' in sourceTheme) {
    return sourceTheme;
  }

  // 旧形式のカラーを新形式に変換
  const colorMap: Record<string, any> = {
    'はてなブックマーク': {
      gradient: 'from-blue-400 to-blue-600',
      border: 'border-blue-200',
      hover: 'hover:border-blue-400',
      tag: 'bg-blue-50 text-blue-700',
      dot: 'bg-blue-500',
      bar: 'bg-blue-500',
    },
    'Qiita': {
      gradient: 'from-green-400 to-green-600',
      border: 'border-green-200',
      hover: 'hover:border-green-400',
      tag: 'bg-green-50 text-green-700',
      dot: 'bg-green-500',
      bar: 'bg-green-500',
    },
    'Qiita Popular': {
      gradient: 'from-green-400 to-green-600',
      border: 'border-green-200',
      hover: 'hover:border-green-400',
      tag: 'bg-green-50 text-green-700',
      dot: 'bg-green-500',
      bar: 'bg-green-500',
    },
    'Zenn': {
      gradient: 'from-sky-400 to-sky-600',
      border: 'border-sky-200',
      hover: 'hover:border-sky-400',
      tag: 'bg-sky-50 text-sky-700',
      dot: 'bg-sky-500',
      bar: 'bg-sky-500',
    },
    'Dev.to': {
      gradient: 'from-indigo-400 to-indigo-600',
      border: 'border-indigo-200',
      hover: 'hover:border-indigo-400',
      tag: 'bg-indigo-50 text-indigo-700',
      dot: 'bg-indigo-500',
      bar: 'bg-indigo-500',
    },
    'Publickey': {
      gradient: 'from-orange-400 to-orange-600',
      border: 'border-orange-200',
      hover: 'hover:border-orange-400',
      tag: 'bg-orange-50 text-orange-700',
      dot: 'bg-orange-500',
      bar: 'bg-orange-500',
    },
    'Stack Overflow Blog': {
      gradient: 'from-amber-400 to-amber-600',
      border: 'border-amber-200',
      hover: 'hover:border-amber-400',
      tag: 'bg-amber-50 text-amber-700',
      dot: 'bg-amber-500',
      bar: 'bg-amber-500',
    },
    'InfoQ Japan': {
      gradient: 'from-blue-400 to-cyan-500',
      border: 'border-cyan-200',
      hover: 'hover:border-cyan-400',
      tag: 'bg-cyan-50 text-cyan-700',
      dot: 'bg-cyan-500',
      bar: 'bg-cyan-500',
    },
    'Think IT': {
      gradient: 'from-purple-400 to-purple-600',
      border: 'border-purple-200',
      hover: 'hover:border-purple-400',
      tag: 'bg-purple-50 text-purple-700',
      dot: 'bg-purple-500',
      bar: 'bg-purple-500',
    },
    'Speaker Deck': {
      gradient: 'from-teal-400 to-teal-600',
      border: 'border-teal-200',
      hover: 'hover:border-teal-400',
      tag: 'bg-teal-50 text-teal-700',
      dot: 'bg-teal-500',
      bar: 'bg-teal-500',
    },
    'AWS': {
      gradient: 'from-yellow-400 to-orange-500',
      border: 'border-yellow-200',
      hover: 'hover:border-yellow-400',
      tag: 'bg-yellow-50 text-yellow-700',
      dot: 'bg-yellow-500',
      bar: 'bg-yellow-500',
    },
    'SRE': {
      gradient: 'from-red-400 to-pink-500',
      border: 'border-red-200',
      hover: 'hover:border-red-400',
      tag: 'bg-red-50 text-red-700',
      dot: 'bg-red-500',
      bar: 'bg-red-500',
    },
    'Rails Releases': {
      gradient: 'from-rose-400 to-rose-600',
      border: 'border-rose-200',
      hover: 'hover:border-rose-400',
      tag: 'bg-rose-50 text-rose-700',
      dot: 'bg-rose-500',
      bar: 'bg-rose-500',
    },
  };

  return colorMap[sourceName] || newColorTheme;
}