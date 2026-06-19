import streamlit as st
import google.generativeai as genai

API_KEY = st.secrets["API_KEY"]

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

st.title("GenHistoria 1.0")

st.write("Ты — Пьемонт-Сардиния. Бот — Австрия.")

if "history" not in st.session_state:
    st.session_state.history = "Италия раздроблена. Австрия контролирует север."

st.write("Ситуация:")
st.write(st.session_state.history)

action = st.text_input("Твой ход:")

if st.button("Сделать ход"):
    prompt = f"""
Ты текстовый игровой ИИ.

Игрок: Пьемонт-Сардиния
Бот: Австрия

Ситуация:
{st.session_state.history}

Игрок сделал:
{action}

Ответь максимум в 2-3 предложения.
Без мгновенных побед.
"""

    response = model.generate_content(prompt)

    st.write("АВСТРИЯ:")
    st.write(response.text)

    st.session_state.history += f"\nИгрок: {action}\nАвстрия: {response.text}"