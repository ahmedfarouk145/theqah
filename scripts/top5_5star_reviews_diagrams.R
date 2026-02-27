args <- commandArgs(trailingOnly = TRUE)

input_path <- if (length(args) >= 1) args[[1]] else "output/spreadsheet/reviews_authorized_non_dev.csv"
output_dir <- if (length(args) >= 2) args[[2]] else "output/spreadsheet"

if (!file.exists(input_path)) {
  stop(sprintf("Input file not found: %s", input_path))
}

dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

df <- read.csv(input_path, stringsAsFactors = FALSE, fileEncoding = "UTF-8")

required_cols <- c("stars", "reviewText", "storeName", "productName", "createdAtUtc")
missing_cols <- setdiff(required_cols, names(df))
if (length(missing_cols) > 0) {
  stop(sprintf("Missing required columns: %s", paste(missing_cols, collapse = ", ")))
}

df$reviewText <- ifelse(is.na(df$reviewText), "", df$reviewText)
df$reviewText <- trimws(df$reviewText)
df$stars_num <- suppressWarnings(as.numeric(df$stars))

is_five_star_text <- !is.na(df$stars_num) & df$stars_num == 5 & nzchar(df$reviewText)
reviews_5 <- df[is_five_star_text, , drop = FALSE]

if (nrow(reviews_5) == 0) {
  stop("No non-empty 5-star reviews found.")
}

count_words <- function(text) {
  cleaned <- gsub("\\s+", " ", trimws(text))
  if (!nzchar(cleaned)) return(0L)
  length(strsplit(cleaned, "\\s+")[[1]])
}

reviews_5$wordCount <- vapply(reviews_5$reviewText, count_words, integer(1))
reviews_5$charCount <- nchar(reviews_5$reviewText, type = "chars", allowNA = TRUE, keepNA = FALSE)

order_idx <- order(-reviews_5$wordCount, -reviews_5$charCount, reviews_5$createdAtUtc)
reviews_5 <- reviews_5[order_idx, , drop = FALSE]

top_n <- min(5, nrow(reviews_5))
top5 <- reviews_5[seq_len(top_n), c("storeName", "productName", "stars", "reviewText", "wordCount", "charCount", "createdAtUtc"), drop = FALSE]
top5$rank <- seq_len(nrow(top5))
top5 <- top5[, c("rank", "storeName", "productName", "stars", "wordCount", "charCount", "createdAtUtc", "reviewText")]

top5_csv <- file.path(output_dir, "top5_5star_wordiest_reviews.csv")
write.csv(top5, top5_csv, row.names = FALSE, fileEncoding = "UTF-8")

plot_labels <- paste0("#", top5$rank, " - ", substr(top5$storeName, 1, 20))

png(file.path(output_dir, "top5_5star_review_wordcount_bar.png"), width = 1600, height = 1000, res = 150)
par(mar = c(5, 14, 5, 2))
barplot(
  rev(top5$wordCount),
  names.arg = rev(plot_labels),
  horiz = TRUE,
  las = 1,
  col = "#2E86AB",
  xlab = "Word Count",
  main = "Top 5 Longest 5-Star Reviews (by Word Count)"
)
dev.off()

extract_tokens <- function(text) {
  x <- tolower(text)
  x <- gsub("[[:punct:]]+", " ", x)
  x <- gsub("[[:digit:]]+", " ", x)
  x <- gsub("\\s+", " ", x)
  trimws(unlist(strsplit(x, "\\s+")))
}

all_tokens <- unlist(lapply(top5$reviewText, extract_tokens), use.names = FALSE)
all_tokens <- all_tokens[nzchar(all_tokens)]

stop_words <- c(
  "و", "في", "على", "من", "الى", "إلى", "مع", "بس", "جدا", "جداً",
  "the", "and", "very", "good"
)
all_tokens <- all_tokens[!(all_tokens %in% stop_words)]

token_freq <- sort(table(all_tokens), decreasing = TRUE)
top_words_n <- min(10, length(token_freq))

if (top_words_n > 0) {
  top_words <- token_freq[seq_len(top_words_n)]
  top_words_df <- data.frame(
    word = names(top_words),
    count = as.integer(top_words),
    stringsAsFactors = FALSE
  )
  write.csv(top_words_df, file.path(output_dir, "top_words_from_top5_reviews.csv"), row.names = FALSE, fileEncoding = "UTF-8")

  png(file.path(output_dir, "top_words_from_top5_reviews_bar.png"), width = 1600, height = 1000, res = 150)
  par(mar = c(5, 14, 5, 2))
  barplot(
    rev(as.integer(top_words_df$count)),
    names.arg = rev(top_words_df$word),
    horiz = TRUE,
    las = 1,
    col = "#F18F01",
    xlab = "Frequency",
    main = "Most Frequent Words in Top 5 5-Star Reviews"
  )
  dev.off()
}

cat(sprintf("Saved: %s\n", top5_csv))
cat(sprintf("Saved charts in: %s\n", normalizePath(output_dir, winslash = "/", mustWork = FALSE)))
