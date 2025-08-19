import { NextRequest, NextResponse } from 'next/server';
import { 
  getFilterPreferences, 
  setFilterPreferences, 
  deleteFilterPreferences,
  FilterPreferences 
} from '@/lib/filter-preferences-cookie';

export async function GET(request: NextRequest) {
  try {
    const preferences = getFilterPreferences(request);
    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    console.error('Error getting filter preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get preferences' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const updates: Partial<FilterPreferences> = await request.json();
    const response = NextResponse.json({ success: true });
    
    // Get current preferences
    const current = getFilterPreferences(request);
    
    // Merge with updates, explicitly handling undefined values to clear fields
    const updated: FilterPreferences = {
      ...current,
      updatedAt: new Date().toISOString()
    };
    
    // Explicitly handle each field to allow clearing with undefined
    Object.keys(updates).forEach(key => {
      const k = key as keyof FilterPreferences;
      const value = updates[k];
      
      // undefinedの場合はフィールドを削除
      if (value === undefined) {
        delete updated[k];
      } 
      // 空配列も有効な値として扱う（sourcesフィールドの場合）
      else if (Array.isArray(value) && value.length === 0 && k === 'sources') {
        updated[k] = value as any;
      }
      // その他の値は通常通り設定
      else {
        updated[k] = value as any;
      }
    });
    
    // Set cookie
    setFilterPreferences(response, updated);
    
    return response;
  } catch (error) {
    console.error('Error setting filter preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set preferences' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const response = NextResponse.json({ success: true });
    deleteFilterPreferences(response);
    return response;
  } catch (error) {
    console.error('Error deleting filter preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete preferences' },
      { status: 500 }
    );
  }
}