"use client";

import { useEffect, useState } from "react";

interface Release {
  id: string;
  name: string;
  notion_url: string;
}

interface Task {
  id: string;
  name: string;
  status: string;
  notion_url: string;
  pr_url?: string;
}

interface Feature {
  id: string;
  name: string;
  project: string;
  project_type: 'App' | 'Engine' | 'Platform' | null;
  milestone: 'Alpha' | 'Beta' | 'GA' | null;
  open_tasks: number;
  total_tasks: number;
  notion_url: string;
  tasks: Task[];
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
    
    // Map project type to section name
    const typeToSection: Record<string, 'Product' | 'Engines' | 'Platform'> = {
      'App': 'Product',
      'Engine': 'Engines',
      'Platform': 'Platform',
    };
    
    features.forEach(feature => {
      // Use project_type if available, fall back to project name mapping
      const section = feature.project_type 
        ? typeToSection[feature.project_type] || 'Platform'
        : 'Platform';
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
  
  function stripComponentPrefix(name: string): string {
    return name
      .replace(/^Resolv\s*[—-]\s*/i, '')
      .replace(/^Platform\s*[—-]\s*/i, '');
  }
  
  function getSectionBackgroundColor(sectionName: string): string {
    switch (sectionName) {
      case 'Product': return 'bg-blue-50';
      case 'Engines': return 'bg-purple-50';
      case 'Platform': return 'bg-green-50';
      default: return 'bg-gray-50';
    }
  }
  
  const [drilldownComponent, setDrilldownComponent] = useState<ComponentData | null>(null);
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  
  const toggleFeature = (featureId: string) => {
    setExpandedFeatures(prev => {
      const newSet = new Set(prev);
      if (newSet.has(featureId)) {
        newSet.delete(featureId);
      } else {
        newSet.add(featureId);
      }
      return newSet;
    });
  };
  
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                disabled={releases.length === 0}
              >
                <option value="" className="text-gray-900">
                  {releases.length === 0 
                    ? 'Set NOTION_TOKEN, NOTION_RELEASES_DATABASE_ID, and NOTION_FEATURES_DATABASE_ID to load releases' 
                    : 'Choose a release...'}
                </option>
                {releases.map((release) => (
                  <option key={release.id} value={release.id} className="text-gray-900">
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
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                {releases.find(r => r.id === selectedRelease)?.name || 'Release'} · Milestone: {calculateReleaseMilestone(sections)}
              </h2>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">To Alpha</div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900">
                    {sections.reduce((sum, s) => sum + (s.alpha_d - s.alpha_n), 0)} remaining
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">To Beta</div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900">
                    {sections.reduce((sum, s) => sum + (s.beta_d - s.beta_n), 0)} remaining
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">To GA</div>
                  <div className="text-xl sm:text-2xl font-bold text-gray-900">
                    {sections.reduce((sum, s) => sum + (s.ga_d - s.ga_n), 0)} remaining
                  </div>
                </div>
              </div>
            </div>
            
            {/* Sections */}
            {sections.map((section) => (
              <div key={section.name} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
                  {section.name} · Alpha: {section.alpha_n}/{section.alpha_d} · Beta: {section.beta_n}/{section.beta_d} · GA: {section.ga_n}/{section.ga_d}
                </h2>
                
                {/* Components */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {section.components.map((component) => (
                    <button
                      key={component.name}
                      onClick={() => setDrilldownComponent(component)}
                      className={`border border-gray-300 rounded-lg p-4 hover:border-blue-500 hover:shadow-md transition-all text-left ${getSectionBackgroundColor(section.name)}`}
                    >
                      <div className="font-semibold text-gray-900 mb-3 text-sm">{stripComponentPrefix(component.name)}</div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700 font-medium">Alpha</span>
                          <span className="font-bold text-gray-900">{component.alpha_n}/{component.alpha_d}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700 font-medium">Beta</span>
                          <span className="font-bold text-gray-900">{component.beta_n}/{component.beta_d}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700 font-medium">GA</span>
                          <span className="font-bold text-gray-900">{component.ga_n}/{component.ga_d}</span>
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
                  <h2 className="text-2xl font-bold text-gray-900">{stripComponentPrefix(drilldownComponent.name)}</h2>
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
            
            <div className="p-6 space-y-3">
              {drilldownComponent.features.map((feature) => {
                const isExpanded = expandedFeatures.has(feature.id);
                return (
                  <div key={feature.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="p-4 bg-white hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <a
                              href={feature.notion_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {feature.name}
                            </a>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
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
                          <div className="text-sm text-gray-700">
                            <span className="font-medium">{feature.open_tasks} open</span> / {feature.total_tasks} total tasks
                          </div>
                        </div>
                        
                        {feature.tasks.length > 0 && (
                          <button
                            onClick={() => toggleFeature(feature.id)}
                            className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-md transition-colors"
                            aria-label={isExpanded ? 'Collapse tasks' : 'Expand tasks'}
                          >
                            <svg 
                              className={`w-5 h-5 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {isExpanded && feature.tasks.length > 0 && (
                      <div className="border-t border-gray-200 bg-gray-50">
                        <div className="p-4 space-y-2">
                          {feature.tasks.map((task) => (
                            <div key={task.id} className="flex items-start justify-between gap-3 p-3 bg-white rounded-md border border-gray-200">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <a
                                    href={task.notion_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                                  >
                                    {task.name}
                                  </a>
                                </div>
                                <div className="flex items-center gap-3 text-xs">
                                  <span className={`px-2 py-1 rounded-md font-medium ${
                                    task.status === 'Done' 
                                      ? 'bg-green-100 text-green-800'
                                      : task.status === 'In Progress'
                                      ? 'bg-blue-100 text-blue-800'
                                      : task.status === 'Blocked'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {task.status}
                                  </span>
                                  {task.pr_url && (
                                    <a
                                      href={task.pr_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-1"
                                    >
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                                      </svg>
                                      PR
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
