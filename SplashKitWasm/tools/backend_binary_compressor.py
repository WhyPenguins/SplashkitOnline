'''
Takes two equal length lists of files.
Compresses the files in the first list, and outputs them
with the names in the second list.
'''
import sys
import lzma
import struct

CHUNK_SIZE = 10 * 1024 * 1024  # 10 MB

file_list = sys.argv[1:]
assert len(file_list)%2 == 0, "Non even number of files passed to binary compressor - there should be two equal length sets of files, the uncompressed and compressed names."

file_count = len(file_list)//2;
# split files into two halves, then zip them together
files = zip(file_list[:file_count], file_list[file_count:])

for filename_in, filename_out in files:
    print("Compressing "+filename_in[filename_in.rfind("/"):]+"...")
    try:
        with open(filename_in, 'rb') as f_in, open(filename_out, 'wb') as f_out:
            while True:
                chunk = f_in.read(CHUNK_SIZE)
                if not chunk:
                    break

                # Compress this chunk
                compressed = lzma.compress(chunk, format=lzma.FORMAT_ALONE)

                # Write 4-byte little-endian length prefix
                f_out.write(struct.pack('<I', len(compressed)))

                # Write compressed data
                f_out.write(compressed)
    except:
        sys.exit("\033[91mFailed to read in file to compress at "+filename_in+"\033[0m")
