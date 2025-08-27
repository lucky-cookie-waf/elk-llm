const tagForm   = document.getElementById('tag-form');
const tagInputs = tagForm.querySelectorAll('input[name="tags"]');
const SCROLL_KEY = 'scrollY_restaurants';

  /* 1) 페이지가 열리면 저장된 위치로 스크롤 */
  window.addEventListener('DOMContentLoaded', () => {
    const y = sessionStorage.getItem(SCROLL_KEY);
    if (y !== null) window.scrollTo(0, parseInt(y));
  });

  /* 2) 체크박스가 바뀌면 스크롤 값을 저장한 뒤 폼 자동 제출 */
  tagInputs.forEach(cb => {
    cb.addEventListener('change', () => {
      sessionStorage.setItem(SCROLL_KEY, window.scrollY);
      tagForm.requestSubmit();                 // submit 이벤트 정상 발생
    });
  });
