class TrieNode {
    constructor() {
        this.ids = new Set();
        this.nodes = new Map();
    }

    addWord(index, word, id) {
        if (index >= word.length) {
            this.ids.add(id);
        } else {
            const c = word.charAt(index);
            if (!this.nodes.has(c)) this.nodes.set(c, new TrieNode());
            this.nodes.get(c).addWord(index + 1, word, id);
        }
    }

    getAllIds() {
        let result = new Set(this.ids);
        for (const node of this.nodes.values()) {
            for (const id of node.getAllIds()) {
                result.add(id);
            }
        }
        return result;
    }

    getIds(word, index) {
        if (index >= word.length) {
            return this.getAllIds();
        } else if (this.nodes.has(word.charAt(index))) {
            return this.nodes.get(word.charAt(index)).getIds(word, index + 1);
        } else {
            return new Set();
        }
    }
}

class Trie {
    constructor() {
        this.rootNode = new TrieNode(null);
    }

    addWord(word, id) {
        this.rootNode.addWord(0, word, id);
    }

    getIds(word) {
        return this.rootNode.getIds(word, 0);
    }
}