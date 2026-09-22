// ==========================================================
// Real-Time Weather Dashboard
// Uses Open-Meteo (no API key required):
//   1. Geocoding API  -> convert city name to lat/lon
//   2. Forecast API   -> fetch current + daily weather using lat/lon
// ==========================================================

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const searchForm = document.getElementById('searchForm');
const cityInput = document.getElementById('cityInput');
const locateBtn = document.getElementById('locateBtn');
const statusArea = document.getElementById('statusArea');
const weatherCard = document.getElementById('weatherCard');
const historyArea = document.getElementById('historyArea');

// WMO weather interpretation codes -> emoji + description
// Reference: https://open-meteo.com/en/docs (weathercode table)
const WMO_CODES = {
  0: ['☀️', 'Clear sky'],
  1: ['🌤️', 'Mainly clear'],
  2: ['⛅', 'Partly cloudy'],
  3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'],
  48: ['🌫️', 'Depositing rime fog'],
  51: ['🌦️', 'Light drizzle'],
  53: ['🌦️', 'Moderate drizzle'],
  55: ['🌧️', 'Dense drizzle'],
  61: ['🌧️', 'Slight rain'],
  63: ['🌧️', 'Moderate rain'],
  65: ['🌧️', 'Heavy rain'],
  71: ['🌨️', 'Slight snow'],
  73: ['🌨️', 'Moderate snow'],
  75: ['❄️', 'Heavy snow'],
  80: ['🌦️', 'Rain showers'],
  81: ['🌧️', 'Heavy rain showers'],
  82: ['⛈️', 'Violent rain showers'],
  95: ['⛈️', 'Thunderstorm'],
  96: ['⛈️', 'Thunderstorm with hail'],
  99: ['⛈️', 'Severe thunderstorm with hail'],
};

function getWeatherInfo(code) {
  return WMO_CODES[code] || ['❔', 'Unknown'];
}

function setStatus(message, type = '') {
  statusArea.textContent = message;
  statusArea.className = `status-area ${type}`;
}

function saveToHistory(cityLabel) {
  let history = JSON.parse(localStorage.getItem('weatherHistory') || '[]');
  history = history.filter((c) => c.toLowerCase() !== cityLabel.toLowerCase());
  history.unshift(cityLabel);
  history = history.slice(0, 6);
  localStorage.setItem('weatherHistory', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem('weatherHistory') || '[]');
  historyArea.innerHTML = '';
  history.forEach((city) => {
    const chip = document.createElement('button');
    chip.className = 'history-chip';
    chip.textContent = city;
    chip.addEventListener('click', () => {
      cityInput.value = city;
      handleSearch(city);
    });
    historyArea.appendChild(chip);
  });
}

// Step 1: Geocode a city name into latitude/longitude using async/await + fetch
async function geocodeCity(cityName) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Geocoding request failed (status ${response.status})`);
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error(`No location found for "${cityName}". Check the spelling and try again.`);
  }

  const place = data.results[0];
  return {
    lat: place.latitude,
    lon: place.longitude,
    label: `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}, ${place.country}`,
  };
}

// Step 2: Fetch current + daily forecast data for given coordinates
async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '5',
  });

  const url = `${FORECAST_URL}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather request failed (status ${response.status})`);
  }

  const data = await response.json();

  if (!data.current) {
    throw new Error('Weather data is missing from the API response.');
  }

  return data;
}

// Renders the deeply nested JSON (current + daily arrays) onto the DOM
function renderWeather(locationLabel, data) {
  const current = data.current;
  const daily = data.daily;

  const [icon, description] = getWeatherInfo(current.weather_code);

  document.getElementById('cityName').textContent = locationLabel;
  document.getElementById('cityMeta').textContent =
    `Lat ${data.latitude.toFixed(2)}, Lon ${data.longitude.toFixed(2)} · ${data.timezone}`;
  document.getElementById('weatherIcon').textContent = icon;
  document.getElementById('temperature').textContent = `${Math.round(current.temperature_2m)}°C`;
  document.getElementById('condition').textContent = description;
  document.getElementById('feelsLike').textContent = `${Math.round(current.apparent_temperature)}°C`;
  document.getElementById('humidity').textContent = `${current.relative_humidity_2m}%`;
  document.getElementById('windSpeed').textContent = `${current.wind_speed_10m} km/h`;
  document.getElementById('windDir').textContent = `${current.wind_direction_10m}°`;
  document.getElementById('precip').textContent = `${current.precipitation} mm`;
  document.getElementById('pressure').textContent = `${Math.round(current.surface_pressure)} hPa`;
  document.getElementById('updatedAt').textContent = new Date(current.time).toLocaleString();

  const forecastRow = document.getElementById('forecastRow');
  forecastRow.innerHTML = '';

  daily.time.forEach((dateStr, i) => {
    const [fIcon] = getWeatherInfo(daily.weather_code[i]);
    const dayName = new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
    const max = Math.round(daily.temperature_2m_max[i]);
    const min = Math.round(daily.temperature_2m_min[i]);

    const dayEl = document.createElement('div');
    dayEl.className = 'forecast-day';
    dayEl.innerHTML = `
      <div class="f-name">${dayName}</div>
      <span class="f-icon">${fIcon}</span>
      <div class="f-temp">${max}° / ${min}°</div>
    `;
    forecastRow.appendChild(dayEl);
  });

  weatherCard.classList.remove('hidden');
}

// Orchestrates the two async calls with full try/catch/finally error handling
async function handleSearch(cityName) {
  if (!cityName || !cityName.trim()) {
    setStatus('Please enter a city name.', 'error');
    return;
  }

  setStatus('Fetching weather data…', 'loading');
  weatherCard.classList.add('hidden');

  try {
    const location = await geocodeCity(cityName.trim());
    const weatherData = await fetchWeather(location.lat, location.lon);

    renderWeather(location.label, weatherData);
    saveToHistory(location.label.split(',')[0]);
    setStatus('', '');
  } catch (error) {
    if (error instanceof TypeError) {
      // Typically a network failure (offline, CORS, DNS, etc.)
      setStatus('Network error: unable to reach the weather service. Check your internet connection.', 'error');
    } else {
      setStatus(error.message || 'Something went wrong while fetching weather data.', 'error');
    }
    console.error('Weather fetch error:', error);
  }
}

// Geolocation-based lookup (reverse: coords -> weather directly)
async function handleLocate() {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported by your browser.', 'error');
    return;
  }

  setStatus('Detecting your location…', 'loading');

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        setStatus('Fetching weather data…', 'loading');
        const weatherData = await fetchWeather(latitude, longitude);
        renderWeather('Your Location', weatherData);
        setStatus('', '');
      } catch (error) {
        setStatus(error.message || 'Failed to fetch weather for your location.', 'error');
        console.error(error);
      }
    },
    (geoError) => {
      setStatus('Location access denied or unavailable.', 'error');
      console.error(geoError);
    }
  );
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSearch(cityInput.value);
});

locateBtn.addEventListener('click', handleLocate);

// Load a default city and search history on first paint
window.addEventListener('DOMContentLoaded', () => {
  renderHistory();
  handleSearch('Mumbai');
});
