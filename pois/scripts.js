function mapcat(fn, array) {
    return [].concat.apply([], array.map(fn));
}
function distinct(array) {
    return [...new Set(array)];
}

const getDistanceFromLatLonInKm = (() => {
    const deg2rad = function deg2rad(deg) {
        return deg * (Math.PI / 180)
    };

    return function (lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the earth in km
        const dLat = deg2rad(lat2 - lat1);  // deg2rad below
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km
        return d * 1000;
    }
})();

const loadJson = async function (filename) {
    const statusEl = document.createElement('div');
    const statusLine = document.getElementById('status');
    statusLine.appendChild(statusEl);

    let response = await fetch(filename);
    const reader = response.body.getReader();
    const totalK = Math.round(response.headers.get('Content-Length') / 1024);
    let receivedLength = 0;

    let chunks = [];
    while (true) {
        const {done, value} = await reader.read();

        if (done) {
            break;
        }

        chunks.push(value);
        receivedLength += value.length;

        const recvK = Math.round(receivedLength / 1024);

        statusEl.innerText = `Loading ${filename}... ${recvK} KB / ${totalK} KB`;
    }

    statusLine.removeChild(statusEl);

    let chunksAll = new Uint8Array(receivedLength); // (4.1)
    let position = 0;
    for (let chunk of chunks) {
        chunksAll.set(chunk, position); // (4.2)
        position += chunk.length;
    }

    let result = new TextDecoder("utf-8").decode(chunksAll);

    return JSON.parse(result);
};

const updateLocation = function () {
    navigator.geolocation.getCurrentPosition((position => {
        document.getElementById('lat').value = position.coords.latitude;
        document.getElementById('lon').value = position.coords.longitude;
    }));
};

function doSearch() {
    const res = document.getElementById("result");

    let searchResult = data.index.search(
        document.getElementById("search").value,
        parseFloat(document.getElementById("lat").value),
        parseFloat(document.getElementById("lon").value)
    );

    res.innerHTML = "";
    for (let i = 0; i < searchResult.length; i++) {
        const r = searchResult[i];
        const iDist = Math.round(r.dist);
        res.innerHTML +=
            (`<a target="_blank" href="https://www.google.com/maps/search/${r.coords[0]},${r.coords[1]}">` +
                `<span class="title">${r.title}</span> – ${iDist} м.</a>`);
    }
}

function loadData(prefix) {
    if (prefix === "") {
        prefix = "kyiv-center";
    }
    document.getElementById('search').disabled = true;

    loadJson(`data/${prefix}/objects.json`)
        .then(x => data.index.indexObjects(x))
        .then(() => document.getElementById('search').disabled = false)
        .catch(e => {
            console.error(e);
            window.location.hash = ""
        });
}


class TextHelper {
    static transliterate(str) {
        const cyr = TextHelper.cyrillicMapping;

        str = str.replace(/[ъь]+/g, '');

        return Array.from(str)
            .reduce((s, l) =>
                s + (
                    cyr.get(l)
                    || cyr.get(l.toLowerCase()) === undefined && l
                    || cyr.get(l.toLowerCase()).toUpperCase()
                )
                , '');
    }

    static normalizeString(word) {
        return TextHelper.transliterate(word.toLowerCase());
    }

    /**
     *
     * @param {String} normalizedText
     * @param {String[]} normalizedRequests
     */
    static similarity(normalizedText, normalizedRequests) {
        return normalizedRequests.map(req => normalizedText.indexOf(req) < 0 ? 0 : 1).reduce((a, b) => a + b);
    }

    static bestMatch(texts, request) {
        const reqs = this.textToNormalizedWords(request);
        const ranks = texts.map(this.normalizeString).map(string => this.similarity(string, reqs));
        let bestMatch = 0;
        for (let i = 1; i < texts.length; i++) {
            if (ranks[i] > ranks[bestMatch]) bestMatch = i;
        }
        return texts[bestMatch];
    }

    static textToNormalizedWords(queryString) {
        return queryString.split(" ").map(TextHelper.normalizeString);
    }
}

TextHelper.cyrillicMapping = new Map([
    ['а', 'a'], ['б', 'b'], ['в', 'v'], ['г', 'g'], ['д', 'd'], ['е', 'e'],
    ['є', 'e'], ['ё', 'e'], ['ж', 'j'], ['з', 'z'], ['і', 'i'], ['и', 'i'], ['ї', 'yi'], ['й', 'i'],
    ['к', 'k'], ['л', 'l'], ['м', 'm'], ['н', 'n'], ['о', 'o'], ['п', 'p'], ['р', 'r'],
    ['с', 's'], ['т', 't'], ['у', 'u'], ['ф', 'f'], ['х', 'h'], ['ц', 'c'], ['ч', 'ch'],
    ['ш', 'sh'], ['щ', 'shch'], ['ы', 'y'], ['э', 'e'], ['ю', 'u'], ['я', 'ya'],
]);


class PoiIndex {
    indexObjects(objects) {
        this.objects = objects;
        this.trie = new Trie();
        const objs = Object.values(objects);

        for (let i = 0; i < objs.length; i++) {
            this.indexObject(objs[i]);
        }
    }

    indexObject(object) {
        const objectId = object.id;
        let words = distinct(mapcat(TextHelper.textToNormalizedWords, object.names));
        for (const word of words) {
            this.trie.addWord(word, objectId);
        }
    }

    static setIntersection(sets) {
        if (sets.length === 0) return new Set();
        const intersection = new Set(sets[0]);
        for (let i = 1; i < sets.length; i++) {
            for (let elem of intersection) {
                if (!sets[i].has(elem)) {
                    intersection.delete(elem);
                }
            }
        }
        return intersection;
    }

    search(searchString, lat, lon) {
        if (searchString.trim().length === 0) return [];

        const result = this.sort(this.filter(searchString), lat, lon);
        for (let i = 0; i < result.length; i++) {
            result[i].title = TextHelper.bestMatch(this.objects[result[i].id].names, searchString)
        }
        return result;
    }

    /**
     * @param {String} searchString
     * @returns {String[]} array of ids
     */
    filter(searchString) {
        const reqs = TextHelper.textToNormalizedWords(searchString);
        const founds = reqs.map(req => this.trie.getIds(req));

        const intersection = PoiIndex.setIntersection(founds);
        return Array.from(intersection);
    }

    sort(ids, lat, lon) {
        const result = [];
        for (let i = 0; i < ids.length; i++) {
            const object = this.objects[ids[i]];
            const coords = object.coords;
            let minDistance = Infinity;
            let foundCoords;
            for (let j = 0; j < coords.length; j++) {
                const dst = getDistanceFromLatLonInKm(coords[j][0], coords[j][1], lat, lon);
                if (dst < minDistance) {
                    foundCoords = coords[j];
                    minDistance = dst;
                }
            }
            result.push({
                id: object.id,
                dist: minDistance,
                coords: foundCoords
            });
        }

        result.sort((a, b) => a.dist - b.dist);
        return result.slice(0, 50);
    }
}

const data = {
    index: new PoiIndex()
};

window.onload = () => {
    updateLocation();
    setInterval(updateLocation, 5000);
    loadData(window.location.hash.substring(1));

    window.onhashchange = () => loadData(window.location.hash.substring(1));

    const searchInput = document.getElementById('search');
    searchInput.addEventListener('change', doSearch);
    searchInput.addEventListener('keyup', doSearch);
};

