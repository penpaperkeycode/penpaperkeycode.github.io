---
permalink: /
layout: home
author_profile: true
redirect_from: 
  - /about/
  - /about.html
  - /cv/
  - /resume
---

{% comment %}
  HOW THIS PAGE IS BUILT (this note is not shown on the site)
  - Photo, name, bio, employer, location and profile links: "author:" in _config.yml
  - The About text: right below this note (plain Markdown)
  - Each "include home/..." line further down renders one section from a data file:
      home/experience.html    -> _data/experience.yml    (Work Experience)
      home/education.html     -> _data/education.yml     (Education)
      home/publications.html  -> _data/publications.yml  (Publications)
      home/reviewing.html     -> _data/reviewing.yml     (Reviewing)
    Each data file starts with a short "HOW TO ADD" guide.
    Move or delete an include line to reorder or hide that section.
  - Masthead links: _data/navigation.yml
{% endcomment %}

## About

I am a research scientist and team lead at NAVER Cloud, working on large-scale foundation models. My research focuses on understanding how pre-training, model architecture, and data shape the learning dynamics and capabilities of Transformer models. My work spans foundation model pre-training, multilingual and multimodal learning, and model compression. I aim to bridge fundamental research and large-scale model production, turning empirical insights into more efficient AI systems.

{% include home/experience.html %}

{% include home/education.html %}

{% include home/publications.html %}

{% include home/reviewing.html %}
