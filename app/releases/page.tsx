"use client";

import { useEffect, useState } from "react";

interface Release {
  id: string;
  name: string;
  notion_url: string;
}

interface Feature {
  id: string;
  name: string;
  project: string;
  milestone: 'Alpha' | 'Beta' | 'GA' | null;
  open_tasks: number;
  total_tasks: number;
  notion_url: string;
}

interface ComponentMetrics {
  alpha_n: number;
  alpha_d: number;
  beta_n: number;
  beta_d: number;
  ga_n: number;
  ga_d: number;
}

interface ComponentData extends ComponentMetrics {
  name: string;
  features: Feature[];
}

interface SectionData extends ComponentMetrics {
  name: 'Product' | 'Engines' | 'Platform';
  components: ComponentData[];
}

type DriftMode = 'off' | 'day' | 'week';

export default function ReleaseProgressPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<string>("");
  const [driftMode, setDriftMode] = useState<DriftMode>("off");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [sections, setSections] = useState<SectionData[]>([]);
  
  // Load releases on mount
  useEffect(() => {
    async function loadReleases() {
      try {
        const response = await fetch('/api/releases');
        const data = await response.json();
        
        if (!response.ok) {
          setError(data.message || 'Failed to load releases');
          setReleases([]);
          return;
        }
        
        setReleases(data.releases || []);
        setError(null);
      } catch (err) {
        console.error('Error loading releases:', err);
        setError('Failed to load releases');
        setReleases([]);
      }
    }
    
    loadReleases();
  }, []);
  
  // Load features when release is selected
  useEffect(() => {
    if (!selectedRelease) {
      setFeatures([]);
      setSections([]);
      return;
    }
    
    async function loadFeatures() {
      setLoading(true);
      try {
        const response = await fetch(`/api/releases/${selectedRelease}/features`);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load features');
        }
        
        const loadedFeatures = data.features || [];
        setFeatures(loadedFeatures);
        
        // Calculate metrics by section and component
        const sectionsData = calculateMetrics(loadedFeatures);
        setSections(sectionsData);
        
        setError(null);
      } catch (err) {
        console.error('Error loading features:', err);
        setError(err instanceof Error ? err.message : 'Failed to load features');
      } finally {
        setLoading(false);
      }
    }
    
    loadFeatures();
  }, [selectedRelease]);
  
  function calculateMetrics(features: Feature[]): SectionData[] {
    const sectionMap = new Map<string, SectionData>();
    
    // Map component names to sections
    const componentToSection: Record<string, 'Product' | 'Engines' | 'Platform'> = {
      'App': 'Product',
      'Engine': 'Engines',
      'Platform': 'Platform',
    };
    
    features.forEach(feature => {
      const section = componentToSection[feature.project] || 'Platform';
      const componentName = feature.project;
      
      if (!sectionMap.has(section)) {
        sectionMap.set(section, {
          name: section,
          components: [],
          alpha_n: 0,
          alpha_d: 0,
          beta_n: 0,
          beta_d: 0,
          ga_n: 0,
          ga_d: 0,
        });
      }
      
      const sectionData = sectionMap.get(section)!;
      let componentData = sectionData.components.find(c => c.name === componentName);
      
      if (!componentData) {
        componentData = {
          name: componentName,
          features: [],
          alpha_n: 0,
          alpha_d: 0,
          beta_n: 0,
          beta_d: 0,
          ga_n: 0,
          ga_d: 0,
        };
        sectionData.components.push(componentData);
      }
      
      componentData.features.push(feature);
      
      // Count features by milestone
      componentData.alpha_d++;
      componentData.beta_d++;
      componentData.ga_d++;
      
      if (feature.milestone === 'Alpha' || feature.milestone === 'Beta' || feature.milestone === 'GA') {
        componentData.alpha_n++;
      }
      
      if (feature.milestone === 'Beta' || feature.milestone === 'GA') {
        componentData.beta_n++;
      }
      
      if (feature.milestone === 'GA') {
        componentData.ga_n++;
      }
      
      // Roll up to section
      sectionData.alpha_d++;
      sectionData.beta_d++;
      sectionData.ga_d++;
      
      if (feature.milestone === 'Alpha' || feature.milestone === 'Beta' || feature.milestone === 'GA') {
        sectionData.alpha_n++;
      }
      
      if (feature.milestone === 'Beta' || feature.milestone === 'GA') {
        sectionData.beta_n++;
      }
      
      if (feature.milestone === 'GA') {
        sectionData.ga_n++;
      }
    });
    
    // Sort sections: Product, Engines, Platform
    const orderedSections = ['Product', 'Engines', 'Platform'] as const;
    return orderedSections
      .map(name => sectionMap.get(name))
      .filter((s): s is SectionData => s !== undefined);
  }
  
  function calculateReleaseMilestone(sections: SectionData[]): 'Alpha' | 'Beta' | 'GA' | 'None' {
    let totalGa = 0;
    let totalBeta = 0;
    let totalAlpha = 0;
    
    sections.forEach(section => {
      totalGa += section.ga_n;
      totalBeta += section.beta_n;
      totalAlpha += section.alpha_n;
    });
    
    if (totalGa > 0) return 'GA';
    if (totalBeta > 0) return 'Beta';
    if (totalAlpha > 0) return 'Alpha';
    return 'None';
  }
  
  const [drilldownComponent, setDrilldownComponent] = useState<ComponentData | null>(null);
  
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8">Release Progress</h1>
        
        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Release Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Release
              </label>
              {error && (
                <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                  {error}
                </div>
              )}
              <select
                value={selectedRelease}
                onChange={(e) => setSelectedRelease(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={releases.length === 0}
              >
                <option value="">
                  {releases.length === 0 ? 'No releases available' : 'Choose a release...'}
                </option>
                {releases.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Drift Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Drift Comparison
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDriftMode('off')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    driftMode === 'off'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Off
                </button>
                <button
                  onClick={() => setDriftMode('day')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    driftMode === 'day'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Day-over-Day
                </button>
                <button
                  onClick={() => setDriftMode('week')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    driftMode === 'week'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Week-over-Week
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {loading && (
          <div className="text-center py-8">
            <p className="text-gray-600">Loading features...</p>
          </div>
        )}
        
        {!loading && selectedRelease && sections.length > 0 && (
          <>
            {/* Release Rollup */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
                Release Milestone: {calculateReleaseMilestone(sections)}
              </h2>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
                <div>
                  <div className="text-sm text-gray-600 mb-1">To Alpha</div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900">
                    {sections.reduce((sum, s) => sum + (s.alpha_d - s.alpha_n), 0)} remaining
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">To Beta</div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900">
                    {sections.reduce((sum, s) => sum + (s.beta_d - s.beta_n), 0)} remaining
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">To GA</div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900">
                    {sections.reduce((sum, s) => sum + (s.ga_d - s.ga_n), 0)} remaining
                  </div>
                </div>
              </div>
            </div>
            
            {/* Sections */}
            {sections.map((section) => (
              <div key={section.name} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">{section.name}</h2>
                
                {/* Section Rollup */}
                <div className="mb-4 p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Alpha: </span>
                      <span className="font-semibold">{section.alpha_n}/{section.alpha_d}</span>
                      <span className="ml-2 text-gray-500">({section.alpha_d - section.alpha_n} remaining)</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Beta: </span>
                      <span className="font-semibold">{section.beta_n}/{section.beta_d}</span>
                      <span className="ml-2 text-gray-500">({section.beta_d - section.beta_n} remaining)</span>
                    </div>
                    <div>
                      <span className="text-gray-600">GA: </span>
                      <span className="font-semibold">{section.ga_n}/{section.ga_d}</span>
                      <span className="ml-2 text-gray-500">({section.ga_d - section.ga_n} remaining)</span>
                    </div>
                  </div>
                </div>
                
                {/* Components */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.components.map((component) => (
                    <button
                      key={component.name}
                      onClick={() => setDrilldownComponent(component)}
                      className="border border-gray-300 rounded-lg p-4 hover:border-blue-500 hover:shadow-md transition-all text-left"
                    >
                      <div className="font-medium text-gray-900 mb-3">{component.name}</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Alpha:</span>
                          <span className="font-semibold">{component.alpha_n}/{component.alpha_d}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Beta:</span>
                          <span className="font-semibold">{component.beta_n}/{component.beta_d}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">GA:</span>
                          <span className="font-semibold">{component.ga_n}/{component.ga_d}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        
        {!loading && selectedRelease && sections.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-600">No features found for this release</p>
          </div>
        )}
      </div>
      
      {/* Drilldown Modal */}
      {drilldownComponent && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-8 z-50"
          onClick={() => setDrilldownComponent(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{drilldownComponent.name}</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {drilldownComponent.features.length} features
                  </p>
                </div>
                <button
                  onClick={() => setDrilldownComponent(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {drilldownComponent.features.map((feature) => (
                <div key={feature.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <a
                      href={feature.notion_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:text-blue-800"
                    >
                      {feature.name}
                    </a>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        feature.milestone === 'GA'
                          ? 'bg-green-100 text-green-800'
                          : feature.milestone === 'Beta'
                          ? 'bg-blue-100 text-blue-800'
                          : feature.milestone === 'Alpha'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {feature.milestone || 'None'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {feature.open_tasks} open / {feature.total_tasks} total tasks
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
