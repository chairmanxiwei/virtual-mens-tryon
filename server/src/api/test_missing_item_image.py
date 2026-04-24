import unittest
from unittest.mock import patch, MagicMock


import api.main_v3 as m


class MissingItemImageTests(unittest.TestCase):
    def test_extract_first_json_obj_ok(self):
        text = "hello {\"category\":\"鞋子\",\"taobaoKeyword\":\"白鞋\",\"keywords\":[\"a\",\"b\",\"c\",\"d\",\"e\",\"f\",\"g\",\"h\"],\"imagePrompt\":\"淘宝同款 高清实拍 白底图 商品图\",\"imageUrl\":\"\"} tail"
        obj = m._extract_first_json_obj(text)
        self.assertIsInstance(obj, dict)
        self.assertEqual(obj.get("category"), "鞋子")

    def test_extract_first_json_obj_none(self):
        self.assertIsNone(m._extract_first_json_obj("no json here"))

    def test_validate_missing_item_meta_missing_keys(self):
        err = m._validate_missing_item_meta({"category": "鞋子"})
        self.assertEqual(err, "missing_taobaoKeyword")

    def test_validate_missing_item_meta_keywords_lt_8(self):
        meta = {"category": "鞋子", "taobaoKeyword": "白鞋", "keywords": ["a"] * 7, "imagePrompt": "淘宝同款 高清实拍 白底图 商品图", "imageUrl": ""}
        err = m._validate_missing_item_meta(meta)
        self.assertEqual(err, "keywords_lt_8")

    def test_build_prompt_contains_required_tokens(self):
        p = m._build_missing_item_llm_prompt("裤子", "通勤", ["上衣", "鞋子"])
        self.assertIn("淘宝同款", p)
        self.assertIn("白底图", p)
        self.assertIn("imageUrl", p)
        self.assertIn("taobaoKeyword", p)
        self.assertIn("category", p)

    @patch.object(m, "call_aliyun_llm_with_fallback", side_effect=Exception("llm down"))
    def test_llm_meta_fallback(self, _):
        meta = m._llm_generate_missing_item_meta(1, "鞋子", "通勤", ["上衣"])
        self.assertEqual(meta.get("category"), "鞋子")
        self.assertTrue(str(meta.get("taobaoKeyword") or "").strip())
        self.assertIsInstance(meta.get("keywords"), list)

    def test_is_probably_image_url(self):
        self.assertTrue(m._is_probably_image_url("https://example.com/a.png"))
        self.assertFalse(m._is_probably_image_url("ftp://example.com/a.png"))

    @patch.object(m.requests, "get")
    def test_check_image_quality_http_error(self, mock_get):
        resp = MagicMock()
        resp.status_code = 404
        resp.headers = {"Content-Type": "text/plain"}
        resp.iter_content.return_value = iter([b""])
        mock_get.return_value = resp
        err = m._check_image_quality("https://example.com/a.png")
        self.assertEqual(err, "http_404")

    @patch.object(m, "_check_image_quality", return_value=None)
    @patch.object(m, "_text2img_cached", return_value="https://example.com/a.png")
    def test_generate_missing_item_image_sync_success(self, mock_text2img, mock_quality):
        out = m._generate_missing_item_image_sync(1, "鞋子", "通勤", ["上衣"])
        self.assertTrue(out.get("success"))
        self.assertEqual(out.get("image_url"), "https://example.com/a.png")
        self.assertTrue(out.get("meta", {}).get("imageUrl"))

    @patch.object(m, "_check_image_quality", side_effect=["size_lt_500:100x100", None])
    @patch.object(m, "_text2img_cached", side_effect=["https://example.com/bad.png", "https://example.com/good.png"])
    def test_generate_missing_item_image_sync_retry(self, mock_text2img, mock_quality):
        out = m._generate_missing_item_image_sync(1, "配饰", "休闲", ["上衣", "裤子"])
        self.assertTrue(out.get("success"))
        self.assertEqual(out.get("image_url"), "https://example.com/good.png")
        self.assertEqual(mock_text2img.call_count, 2)


if __name__ == "__main__":
    unittest.main()
