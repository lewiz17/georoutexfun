import { useState, useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import {
  Plane, Car, Navigation, Gauge, Clock, Download,
  MapPin, Play, Pause, RefreshCw, Layers, Zap, Settings,
  Video, Monitor, MousePointer2, Move, Send, Info
} from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [telemetry, setTelemetry] = useState({ distance: 0, time: 0 });

  const recordedVideoBlob = useRef(null);
  const cachedRouteData = useRef(null);
  const abortController = useRef(null);
  const vehicleIcons = useRef({});

  // Form state - Default to Colombia
  const [countryOrigin, setCountryOrigin] = useState('CO');
  const [origin, setOrigin] = useState('Bogotá');
  const [countryDest, setCountryDest] = useState('CO');
  const [destination, setDestination] = useState('Medellín');
  const [vehicleType, setVehicleType] = useState('top_sport_red');
  const [speedMode, setSpeedMode] = useState('normal');
  const [routeStyle, setRouteStyle] = useState('solid');
  const [routeColor, setRouteColor] = useState('#3b82f6');
  const [quality, setQuality] = useState('medium');
  const [ratio, setRatio] = useState('ratio-16-9');

  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-74.0721, 4.7110], // Centrado en Bogotá
      zoom: 6,
      pitch: 15, // Flattened for Top View
      bearing: 0,
      preserveDrawingBuffer: true
    });

    // Add navigation controls (Zoom +/-)
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Load vehicle icons from public folder
    const script = document.createElement('script');
    script.src = '/vehicle_icons.js';
    script.onload = () => {
      // Accessing the variable defined in the script
      vehicleIcons.current = window.VEHICLE_ICONS || {};
      console.log('Vehicle icons loaded:', Object.keys(vehicleIcons.current));
    };
    document.body.appendChild(script);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Sync ref with state
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (map.current) {
      setTimeout(() => map.current.resize(), 550);
    }
  }, [ratio]);

  const getCoords = async (city, countryCode) => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&countrycodes=${countryCode.toLowerCase()}&limit=1`
    );
    const data = await res.json();
    if (!data.length) throw new Error(`Ciudad "${city}" no encontrada en el país seleccionado`);
    return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
  };

  const getRoute = async (start, end, vehicleType) => {
    if (vehicleType === 'plane') {
      const startPt = turf.point(start);
      const endPt = turf.point(end);
      const greatCircle = turf.greatCircle(startPt, endPt, { npoints: 500 });
      return greatCircle.geometry;
    }

    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`
    );
    const data = await response.json();

    if (!data.routes || !data.routes.length) {
      throw new Error('No se pudo calcular la ruta');
    }

    return data.routes[0].geometry;
  };

  const getVehicleIcon = (vehicleType) => {
    const img = new Image(128, 128);
    const icons = vehicleIcons.current || {};

    // Mapping for new local assets
    const localAssets = {
      top_sport_red: '/top_sport_red.png',
      top_truck_grey: '/top_truck_grey.png',
      top_truck_green: '/top_truck_green.png',
      top_taxi: '/top_taxi.png',
      plane: '/top_plane.png'
    };

    const src = localAssets[vehicleType] || icons[vehicleType] || icons.car;

    if (src) {
      img.src = src;
    } else {
      // More realistic car fallback if icons haven't loaded yet
      console.warn(`Icon for ${vehicleType} not found, using generic car fallback`);
      img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Crect x='10' y='20' width='44' height='24' rx='4' fill='%23555'/%3E%3Crect x='15' y='15' width='34' height='20' rx='10' fill='%23888'/%3E%3C/svg%3E";
    }
    return img;
  };

  const preWarmRoute = async (geometry, vehicleType, signal) => {
    const path = turf.lineString(geometry.coordinates);
    const pathLength = turf.length(path);
    const steps = 20;

    if (map.current.getLayer('vehicle-layer')) {
      map.current.setLayoutProperty('vehicle-layer', 'visibility', 'none');
    }

    for (let i = 0; i <= steps; i++) {
      if (signal.aborted) return;
      const progress = i / steps;
      const point = turf.along(path, progress * pathLength);
      let coords = point.geometry.coordinates;

      if (vehicleType !== 'plane') {
        map.current.jumpTo({ center: coords, zoom: 13.5, pitch: 15, bearing: 0 });
      } else {
        const bounds = new maplibregl.LngLatBounds();
        geometry.coordinates.forEach(coord => bounds.extend(coord));
        map.current.fitBounds(bounds, { padding: 100, animate: false });
      }
      await new Promise(r => setTimeout(r, 150));
    }

    if (map.current.getLayer('vehicle-layer')) {
      map.current.setLayoutProperty('vehicle-layer', 'visibility', 'visible');
    }

    if (!signal.aborted && vehicleType !== 'plane') {
      const start = geometry.coordinates[0];
      map.current.jumpTo({ center: start, zoom: 13.5, pitch: 15, bearing: 0 });
    }
    await new Promise(r => setTimeout(r, 500));
  };

  const animateRoute = async (geometry, totalFrames, vehicleType, signal) => {
    const path = turf.lineString(geometry.coordinates);
    const pathLength = turf.length(path);
    const canvas = map.current.getCanvas();

    // Shadow processing for plane
    if (vehicleType === 'plane') {
      const planeImg = getVehicleIcon('plane');
      await new Promise((resolve, reject) => {
        planeImg.onload = resolve;
        planeImg.onerror = resolve; // Continue even if error
      });

      const offCanvas = document.createElement('canvas');
      offCanvas.width = planeImg.width;
      offCanvas.height = planeImg.height;
      const offCtx = offCanvas.getContext('2d');
      offCtx.drawImage(planeImg, 0, 0);

      const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
      const data = imgData.data;

      // Turn every visible pixel into solid black for a real shadow
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
      offCtx.putImageData(imgData, 0, 0);

      if (map.current.hasImage('plane-shadow-icon')) map.current.removeImage('plane-shadow-icon');
      // Pass the canvas object directly or use getImageData
      map.current.addImage('plane-shadow-icon', offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height));

      if (map.current.hasImage('vehicle-icon')) map.current.removeImage('vehicle-icon');
      map.current.addImage('vehicle-icon', planeImg);
    } else if (vehicleType.startsWith('top_')) {
      const img = getVehicleIcon(vehicleType);
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
      if (map.current.hasImage('vehicle-icon')) map.current.removeImage('vehicle-icon');
      map.current.addImage('vehicle-icon', img);
    } else if (vehicleType === 'suv_dual') {
      const imgLeft = new Image();
      imgLeft.src = '/suv_left.png';
      const imgRight = new Image();
      imgRight.src = '/suv_right.png';

      await Promise.all([
        new Promise(r => imgLeft.onload = r),
        new Promise(r => imgRight.onload = r)
      ]);

      if (map.current.hasImage('suv-left')) map.current.removeImage('suv-left');
      if (map.current.hasImage('suv-right')) map.current.removeImage('suv-right');
      map.current.addImage('suv-left', imgLeft);
      map.current.addImage('suv-right', imgRight);
    } else {
      const img = getVehicleIcon(vehicleType);
      if (!img.complete) {
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve; // Continue even if image fails
        });
      }

      if (map.current.hasImage('vehicle-icon')) map.current.removeImage('vehicle-icon');
      map.current.addImage('vehicle-icon', img);
    }

    // Cleanup existing layers and sources to avoid "already exists" errors on restart
    const layersToCleanup = ['route-line', 'vehicle-layer', 'vehicle-shadow-layer'];
    const sourcesToCleanup = ['route', 'vehicle-source', 'vehicle-shadow-source'];

    layersToCleanup.forEach(id => {
      if (map.current.getLayer(id)) map.current.removeLayer(id);
    });
    sourcesToCleanup.forEach(id => {
      if (map.current.getSource(id)) map.current.removeSource(id);
    });

    map.current.addSource('route', {
      type: 'geojson',
      data: { type: 'Feature', geometry: geometry }
    });

    const styleMap = { solid: [1, 0], dashed: [2, 2], dotted: [0.1, 2] };
    const lineDash = vehicleType === 'plane' ? [2, 3] : styleMap[routeStyle];

    map.current.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      paint: {
        'line-color': routeColor,
        'line-width': vehicleType === 'plane' ? 3 : 5,
        'line-opacity': 0.8,
        'line-dasharray': lineDash
      }
    });

    map.current.addSource('vehicle-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // Shadow Source and Layer (Only for visual depth)
    map.current.addSource('vehicle-shadow-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.current.addLayer({
      id: 'vehicle-shadow-layer',
      type: 'symbol',
      source: 'vehicle-shadow-source',
      layout: {
        'icon-image': vehicleType === 'plane' ? 'plane-shadow-icon' : (vehicleType === 'suv_dual' ? ['get', 'iconId'] : 'vehicle-icon'),
        'icon-size': vehicleType.startsWith('top_') ? 0.45 : (vehicleType === 'suv_dual' || vehicleType === 'plane' ? 0.35 : 1),
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      },
      paint: {
        'icon-opacity': vehicleType === 'plane' ? 0.8 : 0,
        'icon-translate': [3, 3] // Sharp shadow to pop against the map
      }
    });

    map.current.addLayer({
      id: 'vehicle-layer',
      type: 'symbol',
      source: 'vehicle-source',
      layout: {
        'icon-image': vehicleType === 'suv_dual' ? ['get', 'iconId'] : 'vehicle-icon',
        'icon-size': vehicleType.startsWith('top_') ? 0.45 : (vehicleType === 'suv_dual' || vehicleType === 'plane' ? 0.35 : 1),
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      },
      paint: {
        'icon-translate': vehicleType === 'plane' ? [0, -25] : [0, 0] // Elevated for plane
      }
    });

    const bounds = new maplibregl.LngLatBounds();
    geometry.coordinates.forEach(coord => bounds.extend(coord));
    map.current.fitBounds(bounds, { padding: 100, animate: false });

    await new Promise(r => setTimeout(r, 500));
    if (signal.aborted) return;

    if (vehicleType === 'plane') {
      map.current.easeTo({ pitch: 30, duration: 1000 });
      await new Promise(r => setTimeout(r, 1200));
    }

    if (signal.aborted) return;

    let videoBitsPerSecond = 4500000;
    if (quality === 'high') videoBitsPerSecond = 8000000;
    if (quality === 'low') videoBitsPerSecond = 1000000;

    const mimeTypes = ['video/webm; codecs=vp9', 'video/webm; codecs=vp8', 'video/webm'];
    let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';

    const stream = canvas.captureStream(30);
    let mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: videoBitsPerSecond
    });
    let recordedChunks = [];
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.start();

    const easeInOutCubic = (x) => {
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    };

    let frame = 0;
    return new Promise((resolve) => {
      const step = () => {
        if (signal.aborted) {
          mediaRecorder.stop();
          resolve();
          return;
        }

        if (isPausedRef.current) {
          requestAnimationFrame(step);
          return;
        }

        let rawProgress = frame / totalFrames;
        const progress = Math.min(rawProgress, 1);

        if (rawProgress > 1) {
          mediaRecorder.stop();
          setTimeout(() => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            recordedVideoBlob.current = blob;
            resolve();
          }, 500);
          return;
        }

        const currentPoint = turf.along(path, progress * pathLength);
        let coords = currentPoint.geometry.coordinates;

        // Plane follows the trace exactly (no artificial arc needed anymore)

        let nextCoords;
        let lookDist = Math.max(0.05, Math.min(0.5, pathLength * 0.01));
        const distRemaining = pathLength - (progress * pathLength);
        lookDist = Math.min(lookDist, distRemaining);
        const lookAhead = Math.min((progress * pathLength) + lookDist, pathLength);
        nextCoords = turf.along(path, lookAhead).geometry.coordinates;

        let bearing = turf.bearing(turf.point(coords), turf.point(nextCoords));

        let iconId = 'vehicle-icon';
        if (vehicleType === 'suv_dual') {
          // Determine side: use the raw bearing to pick the image
          let norm = (bearing + 360) % 360;
          iconId = (norm >= 0 && norm < 180) ? 'suv-right' : 'suv-left';

          // Isometric Correction: The car in the PNG faces ~60 degrees from its vertical axis.
          // We must compensate this so the longitudinal axis of the 3D car follows the line.
          const correction = iconId === 'suv-right' ? -60 : 60;
          bearing = bearing + correction;
        } else if (vehicleType.startsWith('top_')) {
          // Top view assets uploaded are already facing UP (North)
          // No correction needed for zenithal view
          bearing = bearing;
        } else if (vehicleType === 'plane') {
          // Plane image faces right (East/90deg). To point North(0) at bearing 0, correction is -90.
          bearing = bearing - 90;
        }

        const feature = {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coords },
          properties: {
            bearing: bearing,
            iconId: iconId
          }
        };

        map.current.getSource('vehicle-source').setData({
          type: 'FeatureCollection',
          features: [feature]
        });

        if (vehicleType === 'plane') {
          map.current.getSource('vehicle-shadow-source').setData({
            type: 'FeatureCollection',
            features: [feature]
          });
        }

        // Telemetry Update
        setTelemetry({
          distance: progress * pathLength,
          time: frame / 30
        });

        if (vehicleType !== 'plane') {
          map.current.setCenter(coords);
          map.current.setZoom(13.5);
          map.current.setPitch(15);
        }

        frame++;
        requestAnimationFrame(step);
      };

      step();
    });
  };

  const handleStartGeneration = async () => {
    if (abortController.current) abortController.current.abort();
    abortController.current = new AbortController();
    const signal = abortController.current.signal;

    setIsProcessing(true);
    setVideoReady(false);
    setShowControls(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setTelemetry({ distance: 0, time: 0 });

    // Pre-emptive map cleanup
    if (map.current) {
      const layers = ['vehicle-layer', 'vehicle-shadow-layer', 'route-line'];
      const sources = ['vehicle-source', 'vehicle-shadow-source', 'route'];
      layers.forEach(l => { if (map.current.getLayer(l)) map.current.removeLayer(l); });
      sources.forEach(s => { if (map.current.getSource(s)) map.current.removeSource(s); });
    }

    try {
      if (!origin.trim() || !destination.trim()) {
        throw new Error('Por favor ingresa origen y destino');
      }

      if (signal.aborted) return;

      // Ensure map is loaded before proceeding
      if (!map.current || !map.current.isStyleLoaded()) {
        setStatusText('Esperando al mapa...');
        await new Promise(resolve => {
          const check = () => {
            if (map.current && map.current.isStyleLoaded()) resolve();
            else setTimeout(check, 100);
          };
          check();
        });
      }

      const isInternational = countryOrigin !== countryDest;
      let currentVehicleType = vehicleType;
      if (isInternational) {
        currentVehicleType = 'plane';
        setVehicleType('plane');
      }

      setStatusText('Buscando coordenadas...');
      const startCoords = await getCoords(origin, countryOrigin);
      const endCoords = await getCoords(destination, countryDest);

      if (signal.aborted) return;

      setStatusText(isInternational ? 'Calculando ruta aérea...' : 'Calculando ruta...');
      const routeGeojson = await getRoute(startCoords, endCoords, currentVehicleType);

      if (signal.aborted) return;

      const pathLength = turf.length(routeGeojson);
      // Fixed Speed Logic
      // For cars/domestic: 3km/s (max 60s)
      // For planes/international: Faster factor to avoid long videos, max 40s
      let durationSeconds;
      if (isInternational) {
        durationSeconds = Math.max(20, Math.min(40, pathLength / 200));
      } else {
        durationSeconds = Math.max(15, pathLength / 3);
      }
      const totalFrames = Math.round(durationSeconds * 30);

      cachedRouteData.current = { geometry: routeGeojson, vehicleType: currentVehicleType };

      setStatusText('Pre-cargando mapa...');
      await preWarmRoute(routeGeojson, currentVehicleType, signal);

      if (signal.aborted) return;

      setStatusText('Grabando...');
      setShowControls(true);
      await animateRoute(routeGeojson, totalFrames, currentVehicleType, signal);

      if (!signal.aborted) {
        setStatusText('Video listo para descargar!');
        setVideoReady(true);
        setTimeout(() => setStatusText(''), 3000);
      }
    } catch (err) {
      if (!signal.aborted) {
        console.error('Error:', err);
        alert('❌ Error: ' + err.message);
        setStatusText('');
      }
    } finally {
      if (!signal.aborted) {
        setIsProcessing(false);
      }
    }
  };

  const handleDownload = () => {
    if (recordedVideoBlob.current) {
      const url = URL.createObjectURL(recordedVideoBlob.current);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ruta_${vehicleType}_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleRestart = async () => {
    if (abortController.current) abortController.current.abort();

    if (cachedRouteData.current) {
      abortController.current = new AbortController();
      const signal = abortController.current.signal;

      setStatusText('Reiniciando...');

      try {
        const pathLength = turf.length(cachedRouteData.current.geometry);
        const isInternational = countryOrigin !== countryDest;
        let durationSeconds;
        if (isInternational) {
          durationSeconds = Math.max(20, Math.min(40, pathLength / 200));
        } else {
          durationSeconds = Math.max(15, pathLength / 3);
        }
        const totalFrames = Math.round(durationSeconds * 30);

        const startPoint = cachedRouteData.current.geometry.coordinates[0];
        if (cachedRouteData.current.vehicleType !== 'plane') {
          map.current.jumpTo({ center: startPoint, zoom: 13.5, pitch: 60, bearing: 0 });
        } else {
          const bounds = new maplibregl.LngLatBounds();
          cachedRouteData.current.geometry.coordinates.forEach(coord => bounds.extend(coord));
          map.current.fitBounds(bounds, { padding: 100, animate: false });
          map.current.easeTo({ pitch: 30, duration: 100 });
        }

        await new Promise(r => setTimeout(r, 600));

        if (signal.aborted) return;

        setStatusText('Grabando...');
        setShowControls(true);

        await animateRoute(cachedRouteData.current.geometry, totalFrames, cachedRouteData.current.vehicleType, signal);

        if (!signal.aborted) {
          setStatusText('Video listo para descargar!');
          setVideoReady(true);
          setTimeout(() => setStatusText(''), 3000);
        }
      } catch (err) {
        console.error(err);
        setStatusText('Error reiniciando');
      } finally {
        if (!signal.aborted) {
          setIsProcessing(false);
        }
      }
    } else {
      handleStartGeneration();
    }
  };

  const countries = [
    { value: 'CO', label: 'Colombia' },
    { value: 'ES', label: 'España' },
    { value: 'US', label: 'Estados Unidos' },
    { value: 'MX', label: 'México' },
    { value: 'AR', label: 'Argentina' },
    { value: 'BR', label: 'Brasil' },
    { value: 'FR', label: 'Francia' },
    { value: 'IT', label: 'Italia' },
    { value: 'DE', label: 'Alemania' },
    { value: 'GB', label: 'Reino Unido' }
  ];

  return (
    <div className="app">
      <div className="ui">
        <div className="controls-row">
          <MapPin size={18} className="text-muted" />
          <select value={countryOrigin} onChange={(e) => setCountryOrigin(e.target.value)}>
            {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input
            type="text"
            placeholder="Ciudad origen"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          />

          <Send size={18} className="arrow" />

          <select value={countryDest} onChange={(e) => setCountryDest(e.target.value)}>
            {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input
            type="text"
            placeholder="Ciudad destino"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>

        <div className="controls-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Car size={18} />
            <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
              <option value="top_sport_red">SUV Sport Pro</option>
              <option value="top_taxi">Urban Taxi</option>
              <option value="top_truck_grey">Cargo Grey</option>
              <option value="top_truck_green">Logistics Green</option>
              <option value="plane">Airliner Pro</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} />
            <select value={speedMode} onChange={(e) => setSpeedMode(e.target.value)}>
              <option value="normal">Velocidad Real</option>
              <option value="fast">Timelapse</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} />
            <select value={routeStyle} onChange={(e) => setRouteStyle(e.target.value)}>
              <option value="solid">Trazo Sólido</option>
              <option value="dashed">Trazo Discontinuo</option>
              <option value="dotted">Trazo de Puntos</option>
            </select>
          </div>

          <div className="color-picker">
            <Settings size={18} />
            <input
              type="color"
              value={routeColor}
              onChange={(e) => setRouteColor(e.target.value)}
            />
          </div>

          <select value={quality} onChange={(e) => setQuality(e.target.value)}>
            <option value="high">1080p | 8Mbps</option>
            <option value="medium">720p | 4.5Mbps</option>
            <option value="low">480p | 1.5Mbps</option>
          </select>

          <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
            <option value="ratio-16-9">Horizontal 16:9</option>
            <option value="ratio-9-16">Vertical 9:16</option>
            <option value="ratio-1-1">Cuadrado 1:1</option>
          </select>

          <button
            onClick={handleStartGeneration}
            className={isProcessing ? 'btn-cancel' : ''}
          >
            {isProcessing ? <RefreshCw className="animate-spin" size={18} /> : <Video size={18} />}
            {isProcessing ? 'NUEVO RECORRIDO' : 'GENERAR VIDEO'}
          </button>

          {videoReady && (
            <button onClick={handleDownload} className="btn-download">
              <Download size={18} />
              DESCARGAR
            </button>
          )}
        </div>
      </div>

      <div className="container">
        <div className={`map-wrapper ${ratio}`}>
          <div ref={mapContainer} className="map" />

          {showControls && (
            <div className="telemetry-overlay">
              <div className="telemetry-item">
                <div className="icon"><Navigation size={20} /></div>
                <div className="telemetry-data">
                  <span className="telemetry-label">Distancia</span>
                  <span className="telemetry-value">{telemetry.distance.toFixed(2)} KM</span>
                </div>
              </div>
              <div className="telemetry-item">
                <div className="icon"><Clock size={20} /></div>
                <div className="telemetry-data">
                  <span className="telemetry-label">Tiempo</span>
                  <span className="telemetry-value">{Math.floor(telemetry.time / 60)}:{String(Math.floor(telemetry.time % 60)).padStart(2, '0')}</span>
                </div>
              </div>
            </div>
          )}

          {showControls && (
            <div className="video-controls">
              <button onClick={handlePause} title="Pausar/Reanudar">
                {isPaused ? <Play size={20} /> : <Pause size={20} />}
              </button>
              <button onClick={handleRestart} title="Reiniciar">
                <RefreshCw size={20} />
              </button>
            </div>
          )}

          {statusText && (
            <div className="status">
              {statusText.includes('Grabando') && <span className="recording-led" />}
              {statusText.includes('listo') ? <Info size={14} style={{ marginRight: '6px' }} /> : null}
              {statusText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
