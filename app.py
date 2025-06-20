from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()
    prompt = data.get("prompt", "")

    res = requests.post(
        "http://ollama:11434/api/generate",
        json={"model": "mistral", "prompt": prompt, "stream": False}
    )

    return jsonify(res.json())

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)